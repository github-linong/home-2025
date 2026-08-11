// cloud/model/invite.js
// 邀请里程碑奖励（PRD 17.3）。
const MILESTONES = [
  { count: 1, reward: { puzzleChances: 2, shards: 5 } },
  { count: 3, reward: { srDirected: 1 } },
  { count: 5, reward: { decoration: 'avatar_frame_invite' } },
  { count: 10, reward: { decoration: 'card_back_invite' } },
  { count: 20, reward: { card: 'ssr_friendship' } },
];

// 返回累计达到的所有里程碑（含刚跨过的）
function reachedMilestones(inviteCount) {
  return MILESTONES.filter((m) => inviteCount >= m.count);
}

//  새로 跨过的里程碑（prevCount -> newCount 之间）
function newlyCrossed(prevCount, newCount) {
  return MILESTONES.filter((m) => m.count > prevCount && m.count <= newCount);
}

// 被邀请者新手礼包（PRD 17.2）
const INVITEE_REWARD = { puzzleChances: 3, rarityCard: 'R' };

module.exports = { reachedMilestones, newlyCrossed, INVITEE_REWARD, MILESTONES };
