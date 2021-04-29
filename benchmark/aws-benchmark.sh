#!/bin/bash -e

# Run this script on a FRESH CHECKOUT of bee-queue (prior to running npm/yarn).

# make sure you understand this script before you run it. it may have unexpected
# consequences for your system, and is intended to be run on an Amazon AWS EC2
# instance for consistency.

# quick and dirty benchmark script.

# from an amazing stackoverflow answer: https://stackoverflow.com/a/246128
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WDIR=`mktemp -d`
ODIR="$(pwd)"

cp -R "$DIR/../" "$WDIR/benchmarks-queue"

sudo yum groupinstall -y 'Development Tools'
sudo yum install -y htop
curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.33.2/install.sh | bash
source ~/.bashrc

redis_versions='3.2.10 4.0.1 5.0.12 6.2.2'
node_versions='6.17.1 8.17.0 10.24.1 12.22.1 14.16.1 16.0.0 node'

libraries='bq-min bull bq kue'

for redis_version in $redis_versions; do
  cd "$WDIR"
  tarfile="redis-$redis_version.tar.gz"
  wget "http://download.redis.io/releases/$tarfile"
  tar xzf "$tarfile"
  rm "$tarfile"
  cd "$WDIR/redis-$redis_version"
  make
done

for node_version in $node_versions; do
  nvm install "$node_version"
  npm install -g npm
done

function redis_info () {
  # redis_dir is defined within the loops at the bottom of the file
  "$redis_dir/redis-cli" INFO Stats | grep -E '^(?:total_connections_received|total_commands_processed|total_net_input_bytes|total_net_output_bytes|used_memory_peak)\b'
  "$redis_dir/redis-cli" INFO CPU | grep -E '^used_cpu_(?:sys|user)\b'
}

cd "$WDIR/benchmarks-queue"
npm install
# npm install kue bull

# also test bee-queue@0.x
cp -R "$WDIR/benchmarks-queue/benchmark/bq" "$WDIR/benchmarks-queue/benchmark/bq-0"
mkdir "$WDIR/benchmarks-queue/benchmark/bq-0/node_modules"
cd "$WDIR/benchmarks-queue/benchmark/bq-0"
npm install bee-queue@0

cd "$WDIR/benchmarks-queue/benchmark"

# lotta combinations here :D
for redis_version in $redis_versions; do
  redis_dir="$WDIR/redis-$redis_version/src"
  for node_version in $node_versions; do
    nvm use "$node_version"
    for lib in $libraries; do
      export BQ_MINIMAL=
      name="$lib"
      if [[ "$lib" == 'bq-min' ]]; then
        lib=bq
        export BQ_MINIMAL=1
      fi
      for c in 1 5 20 50; do
        for i in 0 1 2; do
          echo "$name@$c [$node_version #$i] {redis $redis_version}"
          # run redis-server in the background, ignore its output, and disable
          # persist-to-disk.
          "$redis_dir/redis-server" --save '' --appendonly no 2>/dev/null >/dev/null &
          # wait for the server to accepting connections
          while ! nc -z localhost 6379; do sleep 0.1; done
          CONCURRENCY="$c" /usr/bin/time -v node "$lib/harness"
          redis_info
          "$redis_dir/redis-cli" shutdown
        done
      done
    done
  done
done
