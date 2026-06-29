/* 🍫 巧克力对半分 —— 把 M×N 格巧克力沿缝隙切成「大小、形状一模一样」且各自连通的两半。
 *
 * 核心思路：
 *  - 棋盘内部的每条「缝隙」（相邻两格之间的边）可以被切开。
 *  - 切开的缝隙集合决定了把格子分成了几块（对相邻格做并查/洪水填充）。
 *  - 合格的一刀两断 = 恰好 2 块、两块格子数相等、两块形状全等（允许旋转/镜像）。
 *    因为用 4 连通求连通块，所以「每块都连在一起」自动满足。
 */
(() => {
  "use strict";

  const CS = 46;       // 每格像素
  const GAP = 3;       // 格间缝隙（视觉）
  const PAD = 9;       // 外边距
  const CORNER = 7;

  // 探索时给不同块上色（>2 块时用来提示“切多了”）；成功时固定用前两种。
  const PALETTE = ["#8a5a2b", "#e9cfa3", "#d98c8c", "#9cc29a", "#caa15a", "#9fb6d8", "#c79bd1"];

  let rows = 4, cols = 4, boardCount = 6;
  let boards = [];               // { id, cuts:Set, cardEl, statusEl, cellRects:[][], cutsGroup, solved, solutionKey }
  const distinctSolutions = new Set();

  let ADJ = [];                  // 相邻表（按格子下标 r*cols+c）
  let totalSolutions = 0;        // 当前尺寸共有多少种分法
  let totalState = "ok";         // ok | odd | big | capped

  const $ = (id) => document.getElementById(id);
  const rowsSel = $("rows");
  const colsSel = $("cols");
  const countSel = $("count");
  const boardsEl = $("boards");
  const solvedNumEl = $("solvedNum");
  const distinctNumEl = $("distinctNum");
  const parityNote = $("parityNote");
  const targetNote = $("targetNote");
  const praiseModal = $("praiseModal");
  const praiseTitle = $("praiseTitle");
  const praiseText = $("praiseText");

  // 彩虹屁：随机一句，肯定 6–12 岁孩子的努力与思考
  const PRAISES = [
    "你的小脑袋瓜转得真快，这么巧的分法都被你想出来了！",
    "哇，你太会动脑筋了，每一刀都切得好聪明！",
    "你真有耐心，一点点试出了这么多种分法，了不起！",
    "这么难的形状都难不倒你，你就是解谜小高手！",
    "你观察得好仔细，连这种藏起来的分法都被你发现了！",
    "厉害！你的想法又多又妙，简直像个小数学家！",
    "你一直没放弃，认真思考的样子特别棒！",
    "哇塞，你的空间想象力太强啦，佩服佩服！",
    "每一种新分法，都是你动脑筋的成果，真为你骄傲！",
    "你越来越熟练了，脑筋动得又快又准！",
    "你敢去试不一样的切法，这份勇气超级棒！",
    "太棒了，你把巧克力分得又公平又漂亮！",
    "你的专注力真高，一道接一道，停都停不下来！",
    "这一刀切得太妙了，你的创意让人惊喜！",
    "你像小侦探一样，把每一种可能都找了出来！",
    "你的努力一点都没白费，看看你找到了这么多！",
    "真聪明！你能从不同角度去想，特别厉害！",
    "你越想越起劲，这就是爱思考的小天才呀！",
    "你的手和脑配合得真好，切得又稳又准！",
    "你做得超出我的想象，继续加油，你最棒！",
  ];
  function randomPraise() { return PRAISES[Math.floor(Math.random() * PRAISES.length)]; }

  // 里程碑触发标记（每次换新巧克力时重置）
  let halfShown = false, allShown = false, lastBigMilestone = 0;
  let praiseTimer = 0;

  const SVGNS = "http://www.w3.org/2000/svg";
  const el = (name, attrs) => {
    const node = document.createElementNS(SVGNS, name);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  };

  // ---------- 几何 / 校验 ----------

  function vKey(r, c) { return `v-${r}-${c}`; } // 竖缝：格(r,c)与(r,c+1)之间
  function hKey(r, c) { return `h-${r}-${c}`; } // 横缝：格(r,c)与(r+1,c)之间

  // 洪水填充：返回 { count, sizes, comps:[[ [c,r],... ], ...], grid }
  function floodRegions(cuts) {
    const grid = Array.from({ length: rows }, () => new Array(cols).fill(-1));
    const comps = [];
    let id = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[r][c] !== -1) continue;
        const cells = [];
        const stack = [[r, c]];
        grid[r][c] = id;
        while (stack.length) {
          const [cr, cc] = stack.pop();
          cells.push([cc, cr]); // 存成 (x=col, y=row)
          // 右
          if (cc + 1 < cols && grid[cr][cc + 1] === -1 && !cuts.has(vKey(cr, cc))) {
            grid[cr][cc + 1] = id; stack.push([cr, cc + 1]);
          }
          // 左
          if (cc - 1 >= 0 && grid[cr][cc - 1] === -1 && !cuts.has(vKey(cr, cc - 1))) {
            grid[cr][cc - 1] = id; stack.push([cr, cc - 1]);
          }
          // 下
          if (cr + 1 < rows && grid[cr + 1][cc] === -1 && !cuts.has(hKey(cr, cc))) {
            grid[cr + 1][cc] = id; stack.push([cr + 1, cc]);
          }
          // 上
          if (cr - 1 >= 0 && grid[cr - 1][cc] === -1 && !cuts.has(hKey(cr - 1, cc))) {
            grid[cr - 1][cc] = id; stack.push([cr - 1, cc]);
          }
        }
        comps.push(cells);
        id++;
      }
    }
    return { count: id, sizes: comps.map((c) => c.length), comps, grid };
  }

  function normalizeSig(cells) {
    let minx = Infinity, miny = Infinity;
    for (const [x, y] of cells) { if (x < minx) minx = x; if (y < miny) miny = y; }
    return cells
      .map(([x, y]) => [x - minx, y - miny])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1])
      .map((p) => p[0] + "," + p[1])
      .join(";");
  }

  // 8 种二面体变换（旋转 0/90/180/270 × 是否镜像）
  function dihedral(cells) {
    const out = [];
    for (let ref = 0; ref < 2; ref++) {
      let t = cells.map(([x, y]) => (ref ? [-x, y] : [x, y]));
      for (let rot = 0; rot < 4; rot++) {
        out.push(t);
        t = t.map(([x, y]) => [y, -x]); // 旋转 90°
      }
    }
    return out;
  }

  function congruent(a, b) {
    if (a.length !== b.length) return false;
    const bs = normalizeSig(b);
    for (const t of dihedral(a)) {
      if (normalizeSig(t) === bs) return true;
    }
    return false;
  }

  // 形状指纹：把一块的格子在 8 种翻转/旋转下归一，取最小的那个。
  // 形状相同（可翻转/旋转）的切法会得到同一个指纹 —— 用来「按形状」去重。
  function shapeKey(cells) {
    let best = null;
    for (const t of dihedral(cells)) {
      const s = normalizeSig(t);
      if (best === null || s < best) best = s;
    }
    return best;
  }

  // ---------- 统计「这个尺寸共有多少种分法」 ----------
  // 枚举所有「包含左上角格、连通、大小为一半、补集也连通且与之全等」的分割。
  // 每个合法分割按「含左上角的那一半」唯一计数（与界面里‘不同的分法’口径一致）。
  // 仅对小尺寸精确计算；过大或枚举量超限则只提示“很多”。

  function buildAdj() {
    const n = rows * cols;
    const adj = Array.from({ length: n }, () => []);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (c + 1 < cols) adj[i].push(i + 1);
        if (c - 1 >= 0) adj[i].push(i - 1);
        if (r + 1 < rows) adj[i].push(i + cols);
        if (r - 1 >= 0) adj[i].push(i - cols);
      }
    }
    return adj;
  }

  function maskConnected(mask, expected) {
    const n = rows * cols;
    let start = -1;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) { start = i; break; }
    if (start === -1) return expected === 0;
    let seen = 1 << start, cnt = 1;
    const stack = [start];
    while (stack.length) {
      const x = stack.pop();
      for (const nb of ADJ[x]) {
        const b = 1 << nb;
        if ((mask & b) && !(seen & b)) { seen |= b; cnt++; stack.push(nb); }
      }
    }
    return cnt === expected;
  }

  function maskCoords(mask) {
    const out = [];
    const n = rows * cols;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) out.push([i % cols, (i / cols) | 0]);
    return out;
  }

  function countDistinct() {
    const n = rows * cols;
    if (n % 2 !== 0) return { state: "odd" };
    if (n > 24) return { state: "big" }; // 位掩码与枚举量都吃不消，直接提示“很多”
    ADJ = buildAdj();
    const H = n / 2;
    const full = (1 << n) - 1;
    const CAP = 600000;
    let iters = 0, capped = false;
    const shapes = new Set(); // 按形状去重

    function rec(chosenMask, cnt, cand, bannedMask) {
      if (capped) return;
      if (++iters > CAP) { capped = true; return; }
      if (cnt === H) {
        const comp = full & ~chosenMask;
        const a = maskCoords(chosenMask);
        if (maskConnected(comp, H) && congruent(a, maskCoords(comp))) shapes.add(shapeKey(a));
        return;
      }
      if (cand.length === 0) return;
      const c = cand[cand.length - 1];
      const rest = cand.slice(0, -1);
      const bit = 1 << c;
      // 分支一：选入 c
      const nc = chosenMask | bit;
      const add = [];
      for (const nb of ADJ[c]) {
        const nbit = 1 << nb;
        if (nc & nbit) continue;
        if (bannedMask & nbit) continue;
        if (rest.indexOf(nb) >= 0) continue;
        if (add.indexOf(nb) >= 0) continue;
        add.push(nb);
      }
      rec(nc, cnt + 1, rest.concat(add), bannedMask);
      // 分支二：排除 c
      rec(chosenMask, cnt, rest, bannedMask | bit);
    }

    rec(1, 1, ADJ[0].slice(), 0); // 从左上角(下标0)出发
    return { state: capped ? "capped" : "ok", count: shapes.size };
  }

  // 返回该棋盘的分析结果
  function analyze(cuts) {
    const f = floodRegions(cuts);
    const need = (rows * cols) / 2;
    const res = { ...f, valid: false, equalArea: false, congruent: false, need };
    if (f.count === 2) {
      res.equalArea = f.sizes[0] === f.sizes[1];
      if (res.equalArea) {
        res.congruent = congruent(f.comps[0], f.comps[1]);
        res.valid = res.congruent;
      }
    }
    return res;
  }

  // ---------- 渲染 ----------

  function buildBoard(board) {
    const w = cols * CS, h = rows * CS;
    const svg = el("svg", {
      viewBox: `${-PAD} ${-PAD} ${w + 2 * PAD} ${h + 2 * PAD}`,
      role: "img",
    });

    // 底板（缝隙颜色透出来）
    svg.appendChild(el("rect", {
      x: -GAP, y: -GAP, width: w + 2 * GAP, height: h + 2 * GAP,
      rx: CORNER + 2, class: "choco-bar",
    }));

    // 格子
    const cellRects = Array.from({ length: rows }, () => new Array(cols));
    const gCells = el("g", {});
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const rect = el("rect", {
          x: c * CS + GAP, y: r * CS + GAP,
          width: CS - 2 * GAP, height: CS - 2 * GAP,
          rx: CORNER, class: "cell", fill: PALETTE[0],
        });
        gCells.appendChild(rect);
        // 高光（顶部一条）
        gCells.appendChild(el("rect", {
          x: c * CS + GAP + 3, y: r * CS + GAP + 3,
          width: CS - 2 * GAP - 6, height: (CS - 2 * GAP) * 0.34,
          rx: CORNER - 2, class: "cell-hi",
        }));
        cellRects[r][c] = rect;
      }
    }
    svg.appendChild(gCells);

    // 切线层
    const cutsGroup = el("g", {});
    svg.appendChild(cutsGroup);

    // 庆祝层
    const fxGroup = el("g", {});
    svg.appendChild(fxGroup);

    // 缝隙热区（可点/可拖）
    const gHot = el("g", {});
    const addHot = (key, x1, y1, x2, y2) => {
      const line = el("line", {
        x1, y1, x2, y2, class: "hot", "stroke-width": CS * 0.5,
      });
      line.dataset.key = key;
      gHot.appendChild(line);
    };
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols - 1; c++)
        addHot(vKey(r, c), (c + 1) * CS, r * CS, (c + 1) * CS, (r + 1) * CS);
    for (let r = 0; r < rows - 1; r++)
      for (let c = 0; c < cols; c++)
        addHot(hKey(r, c), c * CS, (r + 1) * CS, (c + 1) * CS, (r + 1) * CS);
    svg.appendChild(gHot);

    board.svg = svg;
    board.cellRects = cellRects;
    board.cutsGroup = cutsGroup;
    board.fxGroup = fxGroup;

    // 交互：点按 + 拖动涂抹
    bindDrawing(board, svg);
    return svg;
  }

  function bindDrawing(board, svg) {
    let painting = false;
    let addMode = true; // 本次拖动是“切开”还是“擦掉”

    const keyFromEvent = (e) => {
      const target = document.elementFromPoint(e.clientX, e.clientY);
      return target && target.dataset ? target.dataset.key : undefined;
    };

    const applyKey = (key, forceAdd) => {
      if (!key) return;
      const has = board.cuts.has(key);
      const shouldHave = forceAdd;
      if (shouldHave && !has) board.cuts.add(key);
      else if (!shouldHave && has) board.cuts.delete(key);
      else return;
      refreshBoard(board);
    };

    svg.addEventListener("pointerdown", (e) => {
      const key = e.target && e.target.dataset ? e.target.dataset.key : undefined;
      if (!key) return;
      e.preventDefault();
      painting = true;
      addMode = !board.cuts.has(key); // 起点决定整次拖动的模式
      svg.setPointerCapture(e.pointerId);
      applyKey(key, addMode);
    });

    svg.addEventListener("pointermove", (e) => {
      if (!painting) return;
      e.preventDefault();
      applyKey(keyFromEvent(e), addMode);
    });

    const stop = () => { painting = false; };
    svg.addEventListener("pointerup", stop);
    svg.addEventListener("pointercancel", stop);
    svg.addEventListener("lostpointercapture", stop);
  }

  function refreshBoard(board) {
    const a = analyze(board.cuts);

    // 上色：恰好两块时用「牛奶 / 白巧」两色；否则按调色板区分块数
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cid = a.grid[r][c];
        const fill = a.count === 2 ? PALETTE[cid] : PALETTE[cid % PALETTE.length];
        board.cellRects[r][c].setAttribute("fill", fill);
      }
    }

    // 重画切线
    const g = board.cutsGroup;
    while (g.firstChild) g.removeChild(g.firstChild);
    board.cuts.forEach((key) => {
      const [type, r, c] = key.split("-").map((v, i) => (i === 0 ? v : +v));
      let x1, y1, x2, y2;
      if (type === "v") { x1 = (c + 1) * CS; y1 = r * CS; x2 = (c + 1) * CS; y2 = (r + 1) * CS; }
      else { x1 = c * CS; y1 = (r + 1) * CS; x2 = (c + 1) * CS; y2 = (r + 1) * CS; }
      g.appendChild(el("line", { x1, y1, x2, y2, class: "cut-line" }));
    });

    // 状态文案
    updateStatus(board, a);

    // 记录这次分法的唯一标识：按「切出的形状」去重（翻转/旋转后相同算同一种）
    if (a.valid) {
      board.solutionKey = shapeKey(a.comps[a.grid[0][0]]);
    } else {
      board.solutionKey = null;
    }

    // 成功态切换
    const wasSolved = board.solved;
    board.solved = a.valid;
    board.cardEl.classList.toggle("solved", a.valid);
    if (a.valid && !wasSolved) celebrate(board);
    if (!a.valid) clearFx(board);

    updateGlobalStats();
  }

  function updateStatus(board, a) {
    const s = board.statusEl;
    s.className = "board-status";
    if (board.cuts.size === 0) {
      s.textContent = "点缝隙切一刀～";
      return;
    }
    if (a.valid) {
      s.classList.add("ok");
      s.textContent = "✅ 完美！两半一模一样";
      return;
    }
    if (a.count === 1) {
      s.textContent = "还没切开，继续连到边上";
      return;
    }
    if (a.count > 2) {
      s.classList.add("warn");
      s.textContent = `切成了 ${a.count} 块，要刚好 2 块`;
      return;
    }
    // 恰好两块但不达标
    s.classList.add("warn");
    if (!a.equalArea) {
      s.textContent = `两半不一样大（${a.sizes[0]} : ${a.sizes[1]}，各需 ${a.need}）`;
    } else {
      s.textContent = "一样大，但形状不一样哦";
    }
  }

  function clearFx(board) {
    const g = board.fxGroup;
    while (g.firstChild) g.removeChild(g.firstChild);
  }

  function celebrate(board) {
    clearFx(board);
    const w = cols * CS, h = rows * CS;
    const spots = [[w * 0.5, -2], [w * 0.18, h * 0.2], [w * 0.82, h * 0.25]];
    spots.forEach(([x, y], i) => {
      const star = el("text", {
        x, y, "text-anchor": "middle", "font-size": 22, class: "sparkle",
      });
      star.style.animationDelay = i * 0.08 + "s";
      star.textContent = "✨";
      board.fxGroup.appendChild(star);
    });
  }

  // ---------- 全局 ----------

  function updateGlobalStats() {
    let solved = 0;
    distinctSolutions.clear();
    for (const b of boards) {
      if (b.solved) {
        solved++;
        if (b.solutionKey) distinctSolutions.add(b.solutionKey);
      }
    }
    solvedNumEl.textContent = solved;
    distinctNumEl.textContent = distinctSolutions.size;
    renderTargetNote();
    checkMilestones(distinctSolutions.size);
  }

  function showPraise(title) {
    praiseTitle.textContent = title;
    praiseText.textContent = randomPraise();
    praiseModal.classList.remove("hidden");
    clearTimeout(praiseTimer);
    praiseTimer = setTimeout(hidePraise, 6000);
  }
  function hidePraise() { praiseModal.classList.add("hidden"); }

  function checkMilestones(found) {
    if (totalState === "ok" && totalSolutions > 0) {
      if (!allShown && found >= totalSolutions) {
        allShown = true; halfShown = true;
        showPraise(`🏆 全部 ${totalSolutions} 种分法都被你找齐啦！`);
        return;
      }
      const half = Math.ceil(totalSolutions / 2);
      if (!halfShown && found >= half && found < totalSolutions) {
        halfShown = true;
        showPraise(`🎉 恭喜你已经完成 ${found} 种分法啦！`);
      }
    } else if (totalState === "big" || totalState === "capped") {
      // 不知道总数时，每找到 5 种鼓励一次
      if (found > 0 && found % 5 === 0 && found !== lastBigMilestone) {
        lastBigMilestone = found;
        showPraise(`🎉 已经找出 ${found} 种不同形状啦！`);
      }
    }
  }

  function renderTargetNote() {
    if (totalState === "odd") { targetNote.classList.add("hidden"); return; }
    targetNote.classList.remove("hidden");
    const found = distinctSolutions.size;
    if (totalState === "big" || totalState === "capped") {
      targetNote.textContent = `🎯 这个尺寸能切出非常多种形状，已找出 ${found} 种，尽情探索吧！`;
      return;
    }
    let t = `🎯 这个尺寸一共能切出 ${totalSolutions} 种不同形状，已找出 ${found} 种`;
    if (totalSolutions > 0 && found >= totalSolutions) t += " —— 全部集齐啦！🎉";
    targetNote.textContent = t;
  }

  function makeBoards() {
    boardsEl.innerHTML = "";
    boards = [];
    distinctSolutions.clear();
    halfShown = false; allShown = false; lastBigMilestone = 0;
    hidePraise();

    const odd = (rows * cols) % 2 !== 0;
    parityNote.classList.toggle("hidden", !odd);

    const res = countDistinct();
    totalState = res.state;
    totalSolutions = res.count || 0;

    for (let i = 0; i < boardCount; i++) {
      const card = document.createElement("div");
      card.className = "board-card";

      const board = { id: i, cuts: new Set(), cardEl: card, solved: false };
      card.appendChild(buildBoard(board));

      const foot = document.createElement("div");
      foot.className = "board-foot";
      const status = document.createElement("span");
      status.className = "board-status";
      status.textContent = "点缝隙切一刀～";
      const clearBtn = document.createElement("button");
      clearBtn.className = "mini-clear";
      clearBtn.textContent = "擦掉";
      clearBtn.addEventListener("click", () => {
        board.cuts.clear();
        refreshBoard(board);
      });
      foot.appendChild(status);
      foot.appendChild(clearBtn);
      card.appendChild(foot);

      board.statusEl = status;
      boardsEl.appendChild(card);
      boards.push(board);
    }
    updateGlobalStats();
  }

  // ---------- 初始化 ----------

  function fillSelect(sel, from, to, value) {
    for (let i = from; i <= to; i++) {
      const opt = document.createElement("option");
      opt.value = i;
      opt.textContent = i;
      if (i === value) opt.selected = true;
      sel.appendChild(opt);
    }
  }

  function init() {
    fillSelect(rowsSel, 2, 8, rows);
    fillSelect(colsSel, 2, 8, cols);
    [1, 2, 3, 4, 6, 8, 9, 12].forEach((n) => {
      const opt = document.createElement("option");
      opt.value = n; opt.textContent = n;
      if (n === boardCount) opt.selected = true;
      countSel.appendChild(opt);
    });

    $("applyBtn").addEventListener("click", () => {
      rows = +rowsSel.value;
      cols = +colsSel.value;
      boardCount = +countSel.value;
      makeBoards();
    });

    $("clearAllBtn").addEventListener("click", () => {
      for (const b of boards) { b.cuts.clear(); refreshBoard(b); }
    });

    $("praiseClose").addEventListener("click", hidePraise);
    praiseModal.addEventListener("click", (e) => {
      if (e.target === praiseModal) hidePraise();
    });

    makeBoards();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
