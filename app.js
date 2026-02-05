// ====== small helpers ======
const $ = (id) => document.getElementById(id);
const show = (el) => el.classList.remove('hidden');
const hide = (el) => el.classList.add('hidden');

function nowStr(){
  const d = new Date();
  const pad = (n) => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

function gradeFromScore(score){
  if (score >= 80) return { grade:"A", label:"高可信", tone:"稳的", color:"ok" };
  if (score >= 60) return { grade:"B", label:"中可信", tone:"可用但要留痕", color:"primary" };
  if (score >= 40) return { grade:"C", label:"低可信", tone:"大概率会变", color:"warn" };
  return { grade:"D", label:"高风险", tone:"当作不算数", color:"bad" };
}

// ====== scoring rules ======
// 0-100, higher = more credible
function calcScore(data){
  let base = 60; // baseline

  // scene weights (minor)
  const sceneDelta = {
    deliver: 0,
    perf: -6,
    resource: -8,
    conflict: -10
  };
  base += sceneDelta[data.scene] ?? 0;

  const promiseDelta = {
    clear: +10,
    vague: -10,
    push: -14,
    emotion: -6
  };
  base += promiseDelta[data.promise] ?? 0;

  const nextDelta = {
    owner_time: +12,
    only_time: -6,
    none: -14
  };
  base += nextDelta[data.nextstep] ?? 0;

  const defDelta = {
    clear: +10,
    partial: -6,
    none: -12
  };
  base += defDelta[data.definition] ?? 0;

  const histDelta = {
    high: +14,
    mid: 0,
    low: -18
  };
  base += histDelta[data.history] ?? 0;

  const resDelta = {
    none: 0,
    promised: -6,   // promised but not yet delivered => slight risk
    blocked: -10
  };
  base += resDelta[data.resource] ?? 0;

  const riskDelta = {
    low: +6,
    mid: -6,
    high: -16
  };
  base += riskDelta[data.risk] ?? 0;

  // personal need doesn't change score much; used for advice
  base += 0;

  return clamp(Math.round(base), 0, 100);
}

function buildDims(data, score){
  // dimension text (not numeric chart, but "radar-like" explanation)
  const dims = [];

  // 1) 承诺质量
  let p = "承诺具体、可验证，可信度上升。";
  if (data.promise === "vague") p = "承诺模糊（后面/看情况），容易拖延或改口。";
  if (data.promise === "push") p = "推进型话术（你先做），往往是把不确定性先丢给你。";
  if (data.promise === "emotion") p = "偏安抚型话术，情绪价值>行动承诺，需追问落地动作。";
  dims.push({ k:"承诺质量", v:p });

  // 2) 下一步清晰度
  let n = "下一步清晰：谁做、何时回，执行闭环强。";
  if (data.nextstep === "only_time") n = "只有时间没有负责人/动作，容易变成“无限延期”。";
  if (data.nextstep === "none") n = "没有下一步动作，基本等于“让你继续干/继续等”。";
  dims.push({ k:"闭环程度", v:n });

  // 3) 资源兑现
  let r = "不涉及资源，主要看口径和边界。";
  if (data.resource === "promised") r = "涉及资源承诺：建议把资源清单和到位时间写出来留痕。";
  if (data.resource === "blocked") r = "明确不给资源：你需要重估目标/范围，避免硬扛。";
  dims.push({ k:"资源兑现", v:r });

  // 4) 风险转嫁
  let k = "责任边界清晰，你可按“交付者”推进。";
  if (data.risk === "mid") k = "你主扛但对方会兜底：务必确认兜底方式（谁对外/谁拍板）。";
  if (data.risk === "high") k = "高风险：你全扛且后果不确定，优先做自保（留痕/降范围）。";
  dims.push({ k:"风险转嫁", v:k });

  // Add quick reading based on score
  dims.push({
    k:"一句话解读",
    v: score >= 80 ? "这句话可当作“可执行承诺”，按计划推进即可。"
      : score >= 60 ? "可以推进，但必须“留痕+里程碑”，别只靠口头。"
      : score >= 40 ? "默认会变：把关键点写成邮件/消息确认，降低不确定性。"
      : "当作不算数：先自保，再决定是否投入更多。"
  });

  return dims;
}

function buildActions(data, score){
  const acts = [];

  // universal action 1: force clarity
  if (data.need === "clarify"){
    acts.push("把口径“写出来”：用一句话复述目标、验收标准、截止时间，发消息让对方确认（Yes/No）。");
  } else if (data.need === "protect"){
    acts.push("先自保再推进：把风险点、依赖项、你的责任边界写清楚，避免口头背锅。");
  } else {
    acts.push("把资源要具体：列清单（人/钱/权限/跨部门支持）+ 到位时间 + 你这边的里程碑。");
  }

  // action 2 based on score & risk
  if (score < 60 || data.risk === "high"){
    acts.push("设置“止损点”：如果到某个日期还没确认/资源没到位，立刻降范围或停止投入，别无限内耗。");
  } else {
    acts.push("建立里程碑：每 2-3 天同步一次进展，用事实推进，不给对方“模糊空间”。");
  }

  // action 3 based on resource/history/definition
  if (data.definition === "none" || data.promise !== "clear"){
    acts.push("追问 3 个问题：①做到什么算完成？②谁拍板验收？③如果做不到/资源不到位怎么办？");
  } else if (data.resource === "promised"){
    acts.push("把资源兑现“变成可交付”：到位时间、对接人、交付口径写成一条 checklist，让对方点头。");
  } else if (data.history === "low"){
    acts.push("降低期待：把“承诺”当作“意向”，你按最小投入推进，保留替代方案。");
  } else {
    acts.push("把结果沉淀：做完后用 3 行复盘（结论/数据/下一步），形成你自己的可见度资产。");
  }

  return acts.slice(0, 3);
}

function buildShareText(data, score, g, dims, acts){
  const quote = data.quote?.trim() ? `「${data.quote.trim()}」` : "（未填写具体话术）";
  const sceneMap = {deliver:"交付/项目", perf:"绩效/晋升", resource:"资源/人手", conflict:"冲突/背锅"};
  const scene = sceneMap[data.scene] || "未知场景";
  const lines = [];

  lines.push(`【老板说话可信度测评】`);
  lines.push(`话术：${quote}`);
  lines.push(`场景：${scene}`);
  lines.push(`总分：${score}/100 ｜ 等级：${g.grade}（${g.label}）`);
  lines.push(`一句话：${dims.find(x=>x.k==="一句话解读")?.v || ""}`);
  lines.push(``);
  lines.push(`【建议动作】`);
  acts.forEach((a, i) => lines.push(`${i+1}. ${a}`));
  lines.push(``);
  lines.push(`（工具：规则测评，不调用大模型）`);

  return lines.join("\n");
}

// ====== app state ======
const screenLanding = $("screenLanding");
const screenQuiz = $("screenQuiz");
const screenReport = $("screenReport");

const btnStart = $("btnStart");
const btnBack = $("btnBack");
const btnResetTop = $("btnResetTop");
const btnReset = $("btnReset");
const btnCopy = $("btnCopy");
const btnCopyLink = $("btnCopyLink");

const progressBar = $("progressBar");
const quizForm = $("quizForm");
const inpQuote = $("inpQuote");

function setProgress(){
  // count required radios answered
  const requiredNames = ["scene","promise","nextstep","definition","history","resource","risk","need"];
  let done = 0;
  for (const n of requiredNames){
    if (quizForm.querySelector(`input[name="${n}"]:checked`)) done++;
  }
  // plus quote optional not counted
  const pct = Math.round((done / requiredNames.length) * 100);
  progressBar.style.width = `${pct}%`;
}

function resetAll(){
  quizForm.reset();
  inpQuote.value = "";
  setProgress();
  hide(screenQuiz);
  hide(screenReport);
  show(screenLanding);
  window.scrollTo({top:0, behavior:"smooth"});
}

async function copyToClipboard(text){
  try{
    await navigator.clipboard.writeText(text);
    return true;
  }catch(e){
    return false;
  }
}

// ====== wire ======
btnStart.addEventListener("click", () => {
  hide(screenLanding);
  show(screenQuiz);
  setProgress();
  window.scrollTo({top:0, behavior:"smooth"});
});

btnBack.addEventListener("click", () => {
  hide(screenQuiz);
  show(screenLanding);
  window.scrollTo({top:0, behavior:"smooth"});
});

btnResetTop.addEventListener("click", resetAll);
btnReset.addEventListener("click", resetAll);

quizForm.addEventListener("change", setProgress);

quizForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const data = {
    quote: inpQuote.value,
    scene: quizForm.scene.value,
    promise: quizForm.promise.value,
    nextstep: quizForm.nextstep.value,
    definition: quizForm.definition.value,
    history: quizForm.history.value,
    resource: quizForm.resource.value,
    risk: quizForm.risk.value,
    need: quizForm.need.value
  };

  const score = calcScore(data);
  const g = gradeFromScore(score);
  const dims = buildDims(data, score);
  const acts = buildActions(data, score);

  // render
  $("score").textContent = String(score);
  $("grade").textContent = `${g.grade}｜${g.label}`;

  // badge color via inline style
  const badge = $("grade");
  badge.style.borderColor = "rgba(36,51,85,.9)";
  badge.style.background = "rgba(15,27,51,.35)";
  if (g.color === "ok"){ badge.style.background = "rgba(134,239,172,.14)"; badge.style.borderColor = "rgba(134,239,172,.35)"; }
  if (g.color === "warn"){ badge.style.background = "rgba(251,191,36,.14)"; badge.style.borderColor = "rgba(251,191,36,.35)"; }
  if (g.color === "bad"){ badge.style.background = "rgba(251,113,133,.14)"; badge.style.borderColor = "rgba(251,113,133,.35)"; }
  if (g.color === "primary"){ badge.style.background = "rgba(125,211,252,.16)"; badge.style.borderColor = "rgba(125,211,252,.35)"; }

  $("tagline").textContent =
    score >= 80 ? "这句话可以当作承诺推进" :
    score >= 60 ? "可以推进，但一定要留痕" :
    score >= 40 ? "默认会变：把话写清楚" :
    "高风险：当作不算数";

  $("reportMeta").textContent = `生成时间：${nowStr()}（可截图分享）`;

  const dimsEl = $("dims");
  dimsEl.innerHTML = "";
  dims.forEach(d => {
    const div = document.createElement("div");
    div.className = "dim";
    div.innerHTML = `<div class="k">${d.k}</div><div class="v">${d.v}</div>`;
    dimsEl.appendChild(div);
  });

  const actsEl = $("actionsList");
  actsEl.innerHTML = "";
  acts.forEach(a => {
    const li = document.createElement("li");
    li.textContent = a;
    actsEl.appendChild(li);
  });

  const share = buildShareText(data, score, g, dims, acts);
  $("shareText").value = share;
  $("copyHint").textContent = "";

  hide(screenQuiz);
  show(screenReport);
  window.scrollTo({top:0, behavior:"smooth"});
});

btnCopy.addEventListener("click", async () => {
  const ok = await copyToClipboard($("shareText").value);
  $("copyHint").textContent = ok ? "已复制，可以去小红书/微信粘贴。" : "复制失败：请手动全选复制。";
});

btnCopyLink.addEventListener("click", async () => {
  const ok = await copyToClipboard(location.href);
  $("copyHint").textContent = ok ? "链接已复制，可直接分享。" : "复制失败：请手动复制浏览器地址栏。";
});

// init
resetAll();
