// cloud/model/dailyTask.js
// 每日任务完成判定（PRD 11.3）。
const config = require('./config');

// metrics: { levelClear, newCard, social } 今日累计
// 返回每个任务的 { id, done, progress, target }
function evaluate(metrics) {
  const t = config.tasks();
  return t.daily.map((task) => {
    const cur = metrics[task.metric] || 0;
    return { id: task.id, name: task.name, done: cur >= task.target, progress: Math.min(cur, task.target), target: task.target, reward: task.reward };
  });
}

function allDone(tasks) {
  return tasks.length > 0 && tasks.every((t) => t.done);
}

function allCompleteBonus() {
  return config.tasks().allCompleteBonus;
}

module.exports = { evaluate, allDone, allCompleteBonus };
