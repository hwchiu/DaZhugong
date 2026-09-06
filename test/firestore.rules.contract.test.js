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
    /allow create:\s*if validReportCreate\(groupId, tokenId\)[\s\S]*?\|\| validDirectReportCreate\(groupId, tokenId\)[\s\S]*?\|\| validSpecialTokenReportCreate\(groupId, tokenId\);/,
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

test('rules support the special token (pig-rub easter egg): server-fixed tokenValue and create-only daily-limit marker', () => {
  assert.match(rules, /function validSpecialTokenReportCreate\(groupId, tokenId\)/);
  assert.match(rules, /function validSpecialTokenSummonMarkerCreate\(groupId, markerId\)/);

  // AC19核心：tokenType/displayTokenCount/tokenValue/source全部是規則裡的固定值，
  // 不是拿request.resource.data裡的值直接互相比對信任——這幾行如果被改成
  // 「跟某個外部傳入值比對相等」而不是寫死的常數，就代表這個防線被繞過了。
  assert.match(
    rules,
    /validSpecialTokenReportCreate[\s\S]*?request\.resource\.data\.tokenType == 'SPECIAL_5X'/,
  );
  assert.match(
    rules,
    /validSpecialTokenReportCreate[\s\S]*?request\.resource\.data\.displayTokenCount == 1/,
  );
  assert.match(
    rules,
    /validSpecialTokenReportCreate[\s\S]*?request\.resource\.data\.tokenValue == 5/,
  );
  assert.match(
    rules,
    /validSpecialTokenReportCreate[\s\S]*?request\.resource\.data\.source == 'PIG_RUB_EASTER_EGG'/,
  );
  assert.match(
    rules,
    /validSpecialTokenReportCreate[\s\S]*?isMember\(groupId, request\.resource\.data\.reporterId\)/,
  );

  // 三條建立路徑都要並存在reports的allow create裡，缺一個代表某條流程被漏掉了。
  assert.match(
    rules,
    /allow create:\s*if validReportCreate\(groupId, tokenId\)[\s\S]*?\|\| validDirectReportCreate\(groupId, tokenId\)[\s\S]*?\|\| validSpecialTokenReportCreate\(groupId, tokenId\);/,
  );

  // 每日限制標記：只允許create、明確拒絕update/delete——這是「同一人同一天只能
  // 成功寫入一次」的核心防線，這一行如果消失或改成允許update，每日限制就形同虛設。
  assert.match(rules, /match \/specialTokenSummons\/\{markerId\}[\s\S]*?allow create:\s*if validSpecialTokenSummonMarkerCreate\(groupId, markerId\)/);
  assert.match(rules, /match \/specialTokenSummons\/\{markerId\}[\s\S]*?allow update, delete:\s*if false/);

  // 一般Token的新資料如果也帶了這四個欄位，值必須固定是一般Token的常數，
  // 防止繞過reportSpecialToken()、直接假裝走一般流程夾帶tokenValue=5之類的竄改。
  assert.match(
    rules,
    /validDirectReportCreate[\s\S]*?request\.resource\.data\.tokenType == 'NORMAL'[\s\S]*?request\.resource\.data\.tokenValue == 1/,
  );

  // 申訴流程不能被用來偷改帳務欄位：這四個Token欄位的「更新前後一致」檢查
  // 必須存在，否則有人可以假借申訴流程夾帶偷改tokenValue。
  assert.match(rules, /reportFieldUnchangedOnAppealUpdate\('tokenType'\)/);
  assert.match(rules, /reportFieldUnchangedOnAppealUpdate\('displayTokenCount'\)/);
  assert.match(rules, /reportFieldUnchangedOnAppealUpdate\('tokenValue'\)/);
  assert.match(rules, /reportFieldUnchangedOnAppealUpdate\('source'\)/);
});
