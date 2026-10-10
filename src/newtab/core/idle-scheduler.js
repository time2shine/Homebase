(function () {
  'use strict';

  const runWhenIdle = (cb, timeout = 500) => {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(cb, { timeout });
    } else {
      setTimeout(() => cb({ didTimeout: true, timeRemaining: () => 0 }), Math.min(timeout, 500));
    }
  };

  const IDLE_TASK_BUDGET_MS = 12;
  const idleTaskQueue = [];
  const idleTaskLabels = new Map();
  let idleTaskScheduled = false;

  async function processIdleTasks(deadline) {
    idleTaskScheduled = false;
    const start = performance.now();
    const hasDeadline = deadline && typeof deadline.timeRemaining === 'function';

    while (idleTaskQueue.length) {
      const timeRemaining = hasDeadline ? deadline.timeRemaining() : Infinity;
      const elapsed = performance.now() - start;

      if (elapsed >= IDLE_TASK_BUDGET_MS || (hasDeadline && timeRemaining <= 1)) {
        break;
      }

      const task = idleTaskQueue.shift();
      if (!task) continue;

      task.isRunning = true;
      let result;
      try {
        result = task.fn(deadline);
      } catch (err) {
        console.warn('Idle task failed:', task.label, err);
      }

      const isPromise = result && typeof result.then === 'function';
      if (isPromise) {
        task.isPending = true;
        Promise.resolve(result)
          .catch((err) => {
            console.warn('Idle task failed:', task.label, err);
          })
          .finally(() => {
            task.isPending = false;
            if (task.nextFn) {
              task.fn = task.nextFn;
              task.nextFn = null;
              idleTaskQueue.push(task);
              if (!idleTaskScheduled) {
                idleTaskScheduled = true;
                runWhenIdle(processIdleTasks);
              }
            } else {
              task.isRunning = false;
              if (task.label) {
                idleTaskLabels.delete(task.label);
              }
              return;
            }
          });
        task.isRunning = false;
        continue;
      }

      task.isRunning = false;
      if (task.label) {
        if (task.nextFn) {
          task.fn = task.nextFn;
          task.nextFn = null;
          idleTaskQueue.push(task);
        } else if (!task.isPending) {
          idleTaskLabels.delete(task.label);
        }
      }
    }

    if (idleTaskQueue.length && !idleTaskScheduled) {
      idleTaskScheduled = true;
      runWhenIdle(processIdleTasks);
    }
  }

  // Queue background work to run in short idle slices.
  function scheduleIdleTask(fn, label = 'task') {
    if (typeof fn !== 'function') return;

    if (label) {
      const existing = idleTaskLabels.get(label);
      if (existing) {
        if (existing.isRunning || existing.isPending) {
          existing.nextFn = fn;
        } else {
          existing.fn = fn;
        }
        return;
      }

      const task = { fn, label, nextFn: null, isRunning: false, isPending: false };
      idleTaskLabels.set(label, task);
      idleTaskQueue.push(task);
    } else {
      idleTaskQueue.push({ fn, label: '', nextFn: null, isRunning: false, isPending: false });
    }

    if (!idleTaskScheduled) {
      idleTaskScheduled = true;
      runWhenIdle(processIdleTasks);
    }
  }

  function scheduleIdleChunkedTask(label, stepFn, initialState) {
    if (typeof stepFn !== 'function') return;

    let state = initialState;

    const runner = (deadline) => {
      const hasDeadline = deadline && typeof deadline.timeRemaining === 'function';
      const start = performance.now();

      const shouldYield = () => {
        if (hasDeadline) {
          return deadline.timeRemaining() <= 2;
        }
        return (performance.now() - start) >= Math.max(0, IDLE_TASK_BUDGET_MS - 2);
      };

      while (true) {
        if (shouldYield()) {
          const task = label ? idleTaskLabels.get(label) : null;
          if (task && !task.nextFn) {
            task.nextFn = runner;
          }
          return;
        }

        const result = stepFn(state, deadline);

        if (result && typeof result.then === 'function') {
          return Promise.resolve(result).then((resolved) => {
            const { done, state: newState } = resolved || {};
            if (typeof newState !== 'undefined') {
              state = newState;
            }
            if (done === true) {
              return;
            }
            const task = label ? idleTaskLabels.get(label) : null;
            if (task && !task.nextFn) {
              task.nextFn = runner;
            }
          });
        }

        const { done, state: newState } = result || {};
        if (typeof newState !== 'undefined') {
          state = newState;
        }
        if (done === true) {
          return;
        }
      }
    };

    scheduleIdleTask(runner, label);
  }

  const getQueueLength = () => idleTaskQueue.length;
  const isScheduled = () => idleTaskScheduled;

  window.HomebaseIdleScheduler = {
    runWhenIdle,
    scheduleIdleTask,
    scheduleIdleChunkedTask,
    processIdleTasks,
    getQueueLength,
    isScheduled
  };

  window.runWhenIdle = runWhenIdle;
  window.scheduleIdleTask = scheduleIdleTask;
  window.scheduleIdleChunkedTask = scheduleIdleChunkedTask;
})();
