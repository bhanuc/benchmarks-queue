const helpers = require('bee-queue/lib/helpers');
const Queue = require('bull');
const queue = new Queue('test');

const JSONdb = require('simple-json-db');
const db = new JSONdb('./results/database.json');


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

module.exports = (options) => {
  return queue.isReady().then(() => {
    const {done, next} = reef(options.numRuns);

    queue.process(options.concurrency, () => {
      next();
      return Promise.resolve();
    });

    const startTime = Date.now();
    for (let i = 0; i < options.numRuns; ++i) {
      queue.add({i}, {removeOnComplete: true});
    }
    return done.then(() => {
      const elapsed = Date.now() - startTime;
      const resultJSON = {elapsed, runs: process.env.NUM_RUNS,concurrency: process.env.CONCURRENCY, driver: "Bull"};
      const key = `Bull_${resultJSON.runs}_${resultJSON.concurrency}`;
      db.set(key, JSON.stringify(resultJSON));
      return queue.close().then(() => elapsed);
    });
  });
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
          `!!Ran ${jobs} jobs through Bull with concurrency ${concurrency} in ${time} ms`
        );
      } else {
        console.log(time);
      }
    });
}
