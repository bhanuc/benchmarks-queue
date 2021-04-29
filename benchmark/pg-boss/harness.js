const helpers = require('bee-queue/lib/helpers');
const PgBoss = require('pg-boss');

const boss = new PgBoss('postgres://postgres:password123 @localhost/postgres');

boss.on('error', error => console.error(error));




// A promise-based barrier.
function reef(n = 1) {
  const done = helpers.deferred(),
    end = done.defer();
  return {
    done,
    next() {
      --n;
      if (n < 0) return false;
      if (n === 0) end();
      return true;
    },
  };
}

module.exports = async (options) => {
  const {done, next} = reef(options.numRuns);

  await boss.start();

  const queue = 'some-queue';
  console.log('init');

  
  async function someAsyncJobHandler(job) {
    job.done();
    next();
  }

  await boss.subscribe(queue,{ concurrency: options.concurrency} , someAsyncJobHandler);

  console.log('startTime', options.numRuns);

  const startTime = Date.now();
  for (let i = 0; i < options.numRuns; ++i) {
    await boss.publish(queue, {i});
  }
  console.log('publish');

  await done();
  const elapsed = Date.now() - startTime;
    const promise = helpers.deferred();
    await  boss.deleteQueue(queue);
  console.log('deleteQueue');

  //   return promise.then(() => elapsed);
  // return done.then(async () => {
  // console.log('done');

    
  // });
};

if (require.main === module) {
  const jobs = parseInt(process.env.NUM_RUNS || '10000', 10);
  const concurrency = parseInt(process.env.CONCURRENCY || '1', 10);
  module
    .exports({
      numRuns: jobs,
      concurrency,
    })
    .then((time) => {
      if (process.stdout.isTTY) {
        console.log(
          `Ran ${jobs} jobs through PG-Boss with concurrency ${concurrency} in ${time} ms`
        );
      } else {
        console.log(time);
      }
    });
}
