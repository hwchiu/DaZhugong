const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');

test('rules keep public reads and deny group, member, and memberAuth writes', () => {
  assert.match(rules, /match \/groups\/\{groupId\}/);
  assert.match(rules, /match \/members\/\{memberId\}/);
  assert.match(rules, /match \/memberAuth\/\{memberId\}/);
  assert.match(rules, /allow read:\s*if true/);
  assert.match(rules, /memberAuth[\s\S]*allow read, write:\s*if false/);
});

test('rules encode authenticated token transitions and atomic report creation', () => {
  assert.match(rules, /request\.auth\.uid/);
  assert.match(rules, /function memberIsActive\(groupId, memberId\)/);
  assert.match(rules, /function memberExists\(groupId, memberId\)/);
  assert.match(rules, /get\(memberPath\(groupId, memberId\)\)\.data\.active == true/);
  assert.match(rules, /memberIsActive\(groupId, request\.resource\.data\.targetId\)/);
  assert.match(rules, /memberExists\(groupId, resource\.data\.reporterId\)/);
  assert.match(rules, /memberExists\(groupId, request\.resource\.data\.reporterId\)/);
  assert.match(rules, /memberIsActive\(groupId, resource\.data\.targetId\)/);
  assert.match(rules, /data\.keys\(\)\.hasOnly/);
  assert.match(rules, /request\.resource\.data\.createdAt == request\.time/);
  assert.match(rules, /resource\.data\.status == 'pending'/);
  assert.match(rules, /request\.resource\.data\.status == 'confirmed'/);
  assert.match(rules, /request\.resource\.data\.status == 'rejected'/);
  assert.match(rules, /getAfter/);
  assert.match(rules, /request\.resource\.data\.timestamp == request\.time/);
  // reports本身仍然是「建立後不可任意更動/刪除」的，唯一例外是申訴流程(見後面
  // 專門測試申訴的test)，這裡確認tokens collection依然完全禁止delete。
  assert.match(rules, /match \/tokens\/\{tokenId\}[\s\S]*?allow delete:\s*if false/);
});

test('rules support the new direct-confirm flow (reporter selects target + reason, no separate confirmation step)', () => {
  assert.match(rules, /function validReasonValue\(reason\)/);
  assert.match(rules, /reason\.size\(\) > 0 && reason\.size\(\) <= 200/);
  assert.match(rules, /function validDirectConfirmedTokenCreate\(groupId, tokenId\)/);
  assert.match(rules, /function validDirectReportCreate\(groupId, tokenId\)/);
  assert.match(rules, /function matchingDirectReportAfter\(groupId, tokenId\)/);
  // 核心行為差異：新流程檢查的是reporterId是不是本人，不是targetId——
  // 這一行如果消失或改成targetId，代表新流程又變回「要對方確認」的舊模型了。
  assert.match(
    rules,
    /validDirectConfirmedTokenCreate[\s\S]*?isMember\(groupId, request\.resource\.data\.reporterId\)[\s\S]*?matchingDirectReportAfter/,
  );
  assert.match(
    rules,
    /allow create:\s*if validTokenCreate\(groupId\) \|\| validDirectConfirmedTokenCreate\(groupId, tokenId\)/,
  );
  assert.match(
    rules,
    /allow create:\s*if validReportCreate\(groupId, tokenId\) \|\| validDirectReportCreate\(groupId, tokenId\)/,
  );
  // 舊的雙方確認機制必須原封不動保留，兩條路線並存
  assert.match(rules, /function validTokenUpdate\(groupId, tokenId\)/);
  assert.match(rules, /isMember\(groupId, resource\.data\.targetId\)/);
});

test('rules support the appeal flow: only the record owner can file, only 3+ confirmations can delete', () => {
  assert.match(rules, /function validAppealFileUpdate\(groupId, tokenId\)/);
  assert.match(rules, /function validAppealConfirmUpdate\(groupId, tokenId\)/);
  assert.match(rules, /function validAppealDelete\(groupId, tokenId\)/);
  assert.match(
    rules,
    /allow update:\s*if validAppealFileUpdate\(groupId, tokenId\) \|\| validAppealConfirmUpdate\(groupId, tokenId\)/,
  );
  assert.match(rules, /allow delete:\s*if validAppealDelete\(groupId, tokenId\)/);

  // 提出申訴：只有這筆紀錄的當事人(targetId本人)能做，而且必須是還沒申訴過的紀錄。
  assert.match(
    rules,
    /validAppealFileUpdate[\s\S]*?isMember\(groupId, resource\.data\.targetId\)/,
  );
  assert.match(
    rules,
    /!resource\.data\.keys\(\)\.hasAny\(\['appealedAt'\]\) \|\| resource\.data\.appealedAt == null/,
  );

  // 確認申訴：不能是自己申訴自己的紀錄、不能重複確認、且新加入的成員身分要經過isMember驗證，
  // 這3個關鍵字如果消失，代表這個防護被拿掉了。
  assert.match(rules, /newMemberId != resource\.data\.targetId/);
  assert.match(rules, /!before\.hasAny\(\[newMemberId\]\)/);
  assert.match(
    rules,
    /validAppealConfirmUpdate[\s\S]*?isMember\(groupId, newMemberId\)/,
  );

  // 刪除門檻：這個數字如果被改掉(例如改成1)，就代表門檻被降低了。
  assert.match(rules, /resource\.data\.appealConfirmedBy\.size\(\) >= 3/);
});
