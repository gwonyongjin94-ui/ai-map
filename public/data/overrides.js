// 자동 생성 파일 — /admin.html(데이터 점검)에서 반영한 변경 사항입니다. 직접 고치지 마세요.
// companies.js의 기업 데이터 위에 필드 단위로 덮어쓰고, relations.js의 관계 목록 뒤에 추가한 관계를 붙입니다.
// 되돌리면 손으로 쓴 원래 값으로 돌아갑니다. companies.js·relations.js 다음에 불러와야 합니다.
(function (data) {
  var byId = {};
  (window.AI_COMPANIES || []).forEach(function (c) { byId[c.id] = c; });
  Object.keys(data.companies).forEach(function (id) {
    if (byId[id]) Object.assign(byId[id], data.companies[id].patch);
  });
  var relations = window.AI_RELATIONS || [];
  var seen = {};
  relations.forEach(function (r) { seen[r.from + '>' + r.to + '>' + r.type] = true; });
  (data.relations || []).forEach(function (r) {
    if (!seen[r.from + '>' + r.to + '>' + r.type]) relations.push(r);
  });
  window.AI_OVERRIDES = data;
  window.AI_DATA_UPDATED_AT = data.updatedAt;
})({
  "updatedAt": null,
  "companies": {},
  "relations": []
});
