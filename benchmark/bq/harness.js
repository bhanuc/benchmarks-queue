const helpers = require('bee-queue/lib/helpers');
const Queue = require('bee-queue');
const JSONdb = require('simple-json-db');
const db = new JSONdb('./results/database.json');

const queue = new Queue(
  'test',
  process.env.BQ_MINIMAL
    ? {
        storeJobs: false,
        sendEvents: false,
        getEvents: false,
        removeOnSuccess: true,
      }
    : {
        removeOnSuccess: true,
      }
);

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
  return new Promise((resolve) => {
    queue.on('ready', () => {
      const {done, next} = reef(options.numRuns);

      queue.process(options.concurrency, () => {
        next();
        return Promise.resolve();
      });

      const startTime = Date.now();
      for (let i = 0; i < options.numRuns; ++i) {
        queue.createJob({i}).save();
      }
      return done.then(() => {
        const elapsed = Date.now() - startTime;
        const resultJSON = {elapsed, runs: process.env.NUM_RUNS,concurrency: process.env.CONCURRENCY, driver: "Bee-Queue"};
        const bq_minimal = process.env.BQ_MINIMAL;
        const key = `BQ_${bq_minimal}_${resultJSON.runs}_${resultJSON.concurrency}`;
        db.set(key, JSON.stringify(resultJSON));
        return queue.close().then(() => resolve(elapsed));
      });
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
          `Ran ${jobs} jobs through Bee-Queue with concurrency ${concurrency} in ${time} ms`
        );
      } else {
        console.log(time);
      }
    });
}
