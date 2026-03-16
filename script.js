const app = {
    currentProblem: null,
    steps: [],
    timerInterval: null,
    timerStartTime: 0,
    timerRunning: false,

    init() {
        // Initialize mathjs for random complex points
        this.generateProblem();
    },

    toggleTimer() {
        if (this.timerRunning) this.stopTimer();
        else this.startTimer();
    },

    startTimer() {
        if (this.timerRunning) return;
        this.timerStartTime = Date.now();
        this.timerRunning = true;
        document.getElementById('timer-btn').innerText = "Stop";
        this.timerInterval = setInterval(() => {
            const elapsed = Date.now() - this.timerStartTime;
            const min = Math.floor(elapsed / 60000).toString().padStart(2, '0');
            const sec = Math.floor((elapsed % 60000) / 1000).toString().padStart(2, '0');
            const ms = Math.floor((elapsed % 1000) / 10).toString().padStart(2, '0');
            document.getElementById('timer-display').innerText = `${min}:${sec}:${ms}`;
        }, 10);
    },

    stopTimer() {
        if (!this.timerRunning) return;
        clearInterval(this.timerInterval);
        this.timerRunning = false;
        document.getElementById('timer-btn').innerText = "Start";
    },

    resetTimer() {
        this.stopTimer();
        document.getElementById('timer-display').innerText = "00:00:00";
    },

    generateProblem() {
        this.clearWorkspace();
        this.resetTimer();

        const improper = document.getElementById('opt-improper').checked;
        const factorised = document.getElementById('opt-factorised').checked;
        const repeated = document.getElementById('opt-repeated').checked;
        const quadratic = document.getElementById('opt-quadratic').checked;

        // Generator logic
        // Factors: 1: (x+a), 2: (x+a)^2, 3: (x^2+a^2)
        let factors = [];

        // Always add at least two factors
        const f1 = this.getRandomFactor(1);
        factors.push(f1);

        const factorType = Math.floor(Math.random() * 3) + 1;
        if (factorType === 2 && repeated) factors.push(this.getRandomFactor(2));
        else if (factorType === 3 && quadratic) factors.push(this.getRandomFactor(3));
        else factors.push(this.getRandomFactor(1, f1.val)); // Ensure different linear factor

        // Denominator Expression
        const denStr = factors.map(f => f.str).join('');

        // Numerator Degree
        let denDegree = factors.reduce((acc, f) => acc + f.deg, 0);
        let numDegree = improper ? denDegree + Math.floor(Math.random() * 2) : Math.floor(Math.random() * denDegree);

        // Generate a random numerator polynomial
        let coeffs = [];
        for (let i = 0; i <= numDegree; i++) coeffs.push(Math.floor(Math.random() * 11) - 5 || 1);

        let numStr = coeffs.map((c, i) => {
            if (c === 0) return '';
            let term = '';
            if (i === 0) {
                term = `${c}`;
            } else {
                let absC = Math.abs(c);
                let coeffStr = (absC === 1) ? '' : absC.toString();
                let xPart = i === 1 ? 'x' : `x^${i}`;
                term = (c < 0 ? '-' : '') + coeffStr + xPart;
            }
            return c > 0 ? `+${term}` : term;
        }).reverse().join('').replace(/^\+/, '');

        // Denominator for display (expanded vs factorised)
        let displayDenLatex = this.toLatex(denStr);
        if (!factorised) {
            try {
                const productStr = factors.map(f => f.str).join('*');
                const expanded = math.rationalize(productStr);
                // Use implicit: 'hide' to prevent dots between terms
                displayDenLatex = this.toLatex(expanded);
            } catch (e) {
                displayDenLatex = this.toLatex(denStr);
            }
        }

        this.currentProblem = {
            num: numStr || "1",
            numCoeffs: coeffs,
            den: denStr, // Internal factorised version for comparison
            factors: factors,
            degNum: numDegree,
            degDen: denDegree,
            isProper: numDegree < denDegree,
            raw: `(${numStr || "1"})/(${denStr})`,
            latex: `\\frac{${this.toLatex(numStr || "1")}}{${displayDenLatex}}`
        };

        this.solveCurrentProblem();
        katex.render(this.currentProblem.latex, document.getElementById('math-display'), { throwOnError: false });
        document.getElementById('empty-state').style.display = 'none';
    },

    solveCurrentProblem() {
        const p = this.currentProblem;
        p.targetTerms = [];
        const computeTargetTerms = (numExp) => {
            let terms = [];
            try {
                p.factors.forEach(f => {
                    const m = f.str.match(/\(x([\+\-])(\d+)\)(\^(\d+))?/);
                    if (m) {
                        const rVal = parseInt(m[2]);
                        const root = m[1] === '+' ? -rVal : rVal;
                        const mult = m[4] ? parseInt(m[4]) : 1;
                        const others = p.factors.filter(x => x !== f).map(x => x.str).join('*') || '1';
                        const res = math.evaluate(`(${numExp})/(${others})`, { x: root });
                        terms.push({ root, res, mult, rVal });
                    }
                });
            } catch (e) { }
            return terms;
        };

        if (p.isProper) {
            p.targetTerms = computeTargetTerms(p.num);
        }

        p.solved = {
            quotient: "0",
            remainderNum: "0",
            constants: {}
        };

        try {
            // 1. Long division if improper using internal JS poly-divide
            if (!p.isProper && p.numCoeffs) {
                try {
                    // Calculate denominator coefficients
                    let denCoeffs = [1]; // Degree 0 initially
                    p.factors.forEach(f => {
                        let fCoeffs = [1];
                        if (f.deg === 1) fCoeffs = [f.val * (f.str.includes('+') ? 1 : -1), 1];
                        else if (f.deg === 2 && f.str.includes('^2')) {
                            let v = f.val * (f.str.includes('+') ? 1 : -1);
                            fCoeffs = [v * v, 2 * v, 1];
                        } else if (f.deg === 2) {
                            fCoeffs = [f.val * f.val, 0, 1];
                        }

                        // Multiply
                        let result = new Array(denCoeffs.length + fCoeffs.length - 1).fill(0);
                        for (let i = 0; i < denCoeffs.length; i++) {
                            for (let j = 0; j < fCoeffs.length; j++) {
                                result[i + j] += denCoeffs[i] * fCoeffs[j];
                            }
                        }
                        denCoeffs = result;
                    });

                    let numC = [...p.numCoeffs];
                    let denC = [...denCoeffs];

                    let qC = new Array(Math.max(1, numC.length - denC.length + 1)).fill(0);
                    let rC = [...numC];

                    while (rC.length >= denC.length && rC.length > 0) {
                        let deg_r = rC.length - 1;
                        let deg_d = denC.length - 1;
                        let coeff = rC[deg_r] / denC[deg_d];
                        qC[deg_r - deg_d] = coeff;

                        for (let i = 0; i <= deg_d; i++) {
                            rC[deg_r - deg_d + i] -= coeff * denC[i];
                        }

                        while (rC.length > 0 && Math.abs(rC[rC.length - 1]) < 1e-10) {
                            rC.pop();
                        }
                    }
                    if (rC.length === 0) rC = [0];

                    const polyToString = (coeffs) => {
                        if (!coeffs || coeffs.length === 0) return "0";
                        let str = "";
                        for (let i = coeffs.length - 1; i >= 0; i--) {
                            let c = Math.round(coeffs[i] * 1e10) / 1e10;
                            if (c === 0) continue;
                            let term = "";
                            if (i === 0) term = `${c}`;
                            else {
                                let absC = Math.abs(c);
                                let coeffStr = (absC === 1) ? "" : absC.toString();
                                let xPart = i === 1 ? "x" : `x^${i}`;
                                term = (c < 0 ? "-" : "") + coeffStr + xPart;
                            }
                            if (c > 0 && str.length > 0) str += "+";
                            str += term;
                        }
                        return str || "0";
                    };

                    p.solved.quotient = polyToString(qC);
                    p.solved.remainderNum = polyToString(rC);
                    p.solved.qCoeffs = qC;
                    p.solved.rCoeffs = rC;
                    p.targetTerms = computeTargetTerms(p.solved.remainderNum);
                } catch (e) {
                    console.error("PolyDiv fallback failed", e);
                }
            }
        } catch (e) { console.error("Solving failed", e); }
    },

    getRandomFactor(type, excludeVal) {
        let a = Math.floor(Math.random() * 5) + 1;
        let sign = Math.random() > 0.5 ? '+' : '-';
        if (type === 1) {
            if (a === excludeVal) a++;
            return { str: `(x${sign}${a})`, deg: 1, val: a };
        } else if (type === 2) {
            return { str: `(x${sign}${a})^2`, deg: 2, val: a };
        } else {
            let c = Math.floor(Math.random() * 4) + 1;
            return { str: `(x^2+${c * c})`, deg: 2, val: c };
        }
    },

    addStep() {
        const stepCount = this.steps.length + 1;
        let question = "";
        if (stepCount === 1) question = "Is it a proper or an improper fraction?";
        else if (stepCount === 2) question = "Key in the factorised denominator.";
        else if (stepCount === 3) {
            if (!this.currentProblem.isProper) question = "Key in the expression after performing long division.";
            else question = "Key in the partial fraction decomposition.";
        } else if (stepCount === 4 && !this.currentProblem.isProper) {
            question = "Key in the Final partial fraction decomposition";
        }

        const stepId = Date.now();
        const stepHtml = `
            <div class="step-row" id="step-${stepId}">
                <div class="step-label">Step ${stepCount}</div>
                <div class="step-input-area">
                    ${question ? `<div style="font-size: 0.9rem; color: var(--text-dim); margin-bottom: 0.3rem; font-weight: 600;">${question}</div>` : ''}
                    <input type="text" 
                           class="math-input" 
                           placeholder="${question ? 'Your answer...' : 'Type your working...'}" 
                           oninput="app.updatePreview('${stepId}', this.value)"
                           onkeydown="if(event.key === 'Enter') app.checkStep('${stepId}')">
                    <div class="preview-area" id="preview-${stepId}"></div>
                    <div class="hint-text" id="hint-${stepId}"></div>
                </div>
                <div style="display: flex; gap: 0.5rem; flex-direction: column;">
                    <button class="btn" style="padding: 0.6rem;" onclick="app.checkStep('${stepId}')">Check</button>
                    <button class="btn btn-secondary" style="padding: 0.6rem; color:#ef4444;" onclick="app.removeStep('${stepId}')">Delete</button>
                </div>
            </div>
        `;
        document.getElementById('steps-container').insertAdjacentHTML('beforeend', stepHtml);
        this.steps.push({ id: stepId, content: '' });
        document.getElementById('empty-state').style.display = 'none';

        // Focus the new input
        const row = document.getElementById(`step-${stepId}`);
        row.querySelector('input').focus();
    },

    removeStep(id) {
        document.getElementById(`step-${id}`).remove();
        this.steps = this.steps.filter(s => s.id != id);
        if (this.steps.length === 0) document.getElementById('empty-state').style.display = 'block';
    },

    updatePreview(id, val) {
        const preview = document.getElementById(`preview-${id}`);
        const latex = this.toLatex(val);
        katex.render(latex, preview, { throwOnError: false, displayMode: false });
    },

    checkStep(id) {
        const row = document.getElementById(`step-${id}`);
        const val = row.querySelector('input').value;
        const stepIndex = this.steps.findIndex(s => s.id == id);
        const stepCount = stepIndex + 1;

        if (!val.trim()) return;

        // Reset UI state
        row.classList.remove('correct', 'error');
        const hintEl = document.getElementById(`hint-${id}`);
        const previewEl = document.getElementById(`preview-${id}`);
        hintEl.style.display = 'none';
        hintEl.innerHTML = '';
        void row.offsetWidth; // Trigger reflow

        let isCorrect = false;

        if (stepCount === 1) {
            const ans = val.toLowerCase();
            if (this.currentProblem.isProper) {
                isCorrect = ans.includes('proper') && !ans.includes('improper');
            } else {
                isCorrect = ans.includes('improper');
            }
        } else if (stepCount === 2) {
            isCorrect = this.compareExpressions(val, this.currentProblem.den);
        } else {
            isCorrect = this.compareExpressions(val, this.currentProblem.raw);
        }

        if (isCorrect) {
            row.classList.add('correct');
            const isFinalStep = (!this.currentProblem.isProper && stepCount === 4) || (this.currentProblem.isProper && stepCount === 3);
            if (isFinalStep && !/[A-E]/.test(val)) {
                this.showSuccess(id);
            }
        } else {
            row.classList.add('error');
            if (stepCount === 1) {
                hintEl.innerHTML = "Compare the degree of the polynomials in the numerator and denominator and try again.";
                hintEl.style.display = 'block';
            } else if (stepCount === 2) {
                this.checkStep2Factors(id, val);
            } else if (stepCount >= 3) {
                if (!this.currentProblem.isProper && stepCount === 3) {
                    this.checkImproperStep3(id, val);
                } else {
                    // Improper Step 4, Proper Step 3+
                    this.highlightIncorrectNumbers(id, val);
                    this.provideDecompositionHints(id, val);
                }
            }
        }
    },

    checkImproperStep3(id, val) {
        const p = this.currentProblem;
        const row = document.getElementById(`step-${id}`);
        const previewEl = document.getElementById(`preview-${id}`);
        const hintEl = document.getElementById(`hint-${id}`);

        try {
            const normalizedVal = this.normalizeMathExpression(val);
            const userNode = math.parse(normalizedVal);
            let qTerms = [];
            let fTerms = [];

            const collect = (node) => {
                if (node.isParenthesisNode) {
                    collect(node.content);
                    return;
                }
                if (node.isOperatorNode && node.op === '+') {
                    node.args.forEach(collect);
                } else if (node.isOperatorNode && node.op === '-' && node.args.length === 2) {
                    collect(node.args[0]);
                    const negNode = new math.OperatorNode('*', 'multiply', [
                        new math.ConstantNode(-1),
                        node.args[1]
                    ]);
                    collect(negNode);
                } else {
                    let hasDiv = false;
                    node.traverse(n => { if (n.isOperatorNode && n.op === '/') hasDiv = true; });
                    if (hasDiv) fTerms.push(node);
                    else qTerms.push(node);
                }
            };
            collect(userNode);

            const userQExpr = qTerms.length > 0 ? qTerms.map(t => `(${t.toString()})`).join('+') : "0";
            const userFExpr = fTerms.length > 0 ? fTerms.map(t => `(${t.toString()})`).join('+') : "0";

            const targetQ = p.solved.quotient || "0";

            const targetF = `(${p.solved.remainderNum || "0"}) / (${p.den})`;
            const isTotalCorrect = this.compareExpressions(val, p.raw);
            if (isTotalCorrect) return true;

            const isQCorrect = this.compareExpressions(userQExpr, targetQ);
            const isFCorrect = this.compareExpressions(userFExpr, targetF);

            row.classList.add('error');
            hintEl.innerHTML = "Please ensure you have done the long division correctly to obtain the correct quotient and fractional term.";
            hintEl.style.display = 'block';

            const qL = qTerms.length > 0 ? qTerms.map(t => this.toLatex(t)).join(' + ').replace(/\+ \-/g, '- ') : "";
            const fL = fTerms.length > 0 ? fTerms.map(t => this.toLatex(t)).join(' + ').replace(/\+ \-/g, '- ') : "";

            let finalLatex = "";
            if (!isQCorrect && !isFCorrect) {
                finalLatex = `{\\color{red} ${this.toLatex(userNode)} }`;
            } else if (!isQCorrect) {
                let fPart = fTerms.length > 0 ? (fL.startsWith('-') ? fL : `+ ${fL}`) : "";
                finalLatex = `{\\color{red} ${qL || '\\Box'} } ${fPart}`;
            } else if (!isFCorrect) {
                finalLatex = `${qL} ${qL && fTerms.length > 0 && !fL.startsWith('-') ? '+' : ''} {\\color{red} ${fL || '\\frac{\\Box}{\\Box}'} }`;
            } else {
                finalLatex = `{\\color{red} ${this.toLatex(userNode)} }`;
            }

            try {
                katex.render(finalLatex, previewEl, { throwOnError: true });
            } catch (e) {
                katex.render(`{\\color{red} ${this.toLatex(userNode)} }`, previewEl, { throwOnError: false });
            }
            return false;
        } catch (e) {
            console.error("Long division check failed:", e);
            row.classList.add('error');
            hintEl.innerHTML = "Please enter a valid mathematical expression (e.g., x + 1 + 2/(x-1)).";
            hintEl.style.display = 'block';
            return false;
        }
    },

    highlightIncorrectNumbers(id, val) {
        const previewEl = document.getElementById(`preview-${id}`);
        const p = this.currentProblem;
        try {
            const normalizedVal = this.normalizeMathExpression(val);
            const userNode = math.parse(normalizedVal);
            if (this.compareExpressions(val, p.raw)) return;

            const terms = [];
            const collect = (node) => {
                if (node.isParenthesisNode) {
                    collect(node.content);
                    return;
                }
                if (node.isOperatorNode && node.op === '+') {
                    node.args.forEach(collect);
                } else if (node.isOperatorNode && node.op === '-' && node.args.length === 2) {
                    collect(node.args[0]);
                    terms.push(new math.OperatorNode('*', 'multiply', [
                        new math.ConstantNode(-1),
                        node.args[1]
                    ]));
                } else {
                    terms.push(node);
                }
            };
            collect(userNode);

            const wrongTerms = new Set();
            terms.forEach(term => {
                let hasDiv = false;
                term.traverse(n => { if (n.isOperatorNode && n.op === '/') hasDiv = true; });

                // Check if it's a Quotient term
                if (!hasDiv && p.solved && p.solved.qCoeffs) {
                    let isCorrectQTerm = false;
                    try {
                        const compiled = term.compile();
                        const v2 = compiled.evaluate({ x: 2 });
                        const v3 = compiled.evaluate({ x: 3 });
                        if (Math.abs(v2) < 1e-10 && Math.abs(v3) < 1e-10) {
                            isCorrectQTerm = p.solved.qCoeffs[0] === 0;
                        } else {
                            let v2_real = typeof v2 === 'number' ? v2 : v2.re;
                            let v3_real = typeof v3 === 'number' ? v3 : v3.re;
                            const deg = Math.round(Math.log(Math.abs(v3_real / v2_real)) / Math.log(1.5));
                            if (!isNaN(deg) && deg >= 0 && deg < p.solved.qCoeffs.length) {
                                const c = v2_real / Math.pow(2, deg);
                                if (Math.abs(c - p.solved.qCoeffs[deg]) < 1e-5) {
                                    isCorrectQTerm = true;
                                }
                            }
                        }
                    } catch (e) { }
                    if (!isCorrectQTerm) wrongTerms.add(term);

                } else {
                    // It's a Fraction term, use singularity to check if robust, or fallback to constant check
                    let isTermCorrect = false;

                    try {
                        let targetExpr = math.parse(this.normalizeMathExpression(p.raw)).compile();
                        let termExpr = term.compile();

                        // Find root of this term
                        let uRoot = this.getTermRoot(term);

                        if (uRoot !== null) {
                            const x_close = math.complex(uRoot, 1e-8);
                            const tVal = termExpr.evaluate({ x: x_close });
                            const targVal = targetExpr.evaluate({ x: x_close });
                            const diff = math.abs(math.subtract(targVal, tVal));

                            if (diff < 1e4 && math.abs(tVal) > 1e4) {
                                isTermCorrect = true;
                            }
                        }
                    } catch (e) { }

                    if (!isTermCorrect) {
                        // Fallback to our trusty constant check (cover-up comparison)
                        let uRoot = null;
                        let bestMatch = null;
                        try {
                            uRoot = this.getTermRoot(term);
                            if (uRoot !== null) bestMatch = p.targetTerms.find(t => t.root === uRoot);
                        } catch (e) { }

                        let hasConstants = false;
                        let isConstantsCorrect = true;
                        term.traverse((node) => {
                            if (node.isConstantNode && typeof node.value === 'number') {
                                hasConstants = true;
                                if (!this.isConstantCorrectInTerm(term, node, bestMatch)) {
                                    isConstantsCorrect = false;
                                }
                            }
                        });

                        // If no constants exist to verify, we assume it's wrong (or the math structure itself is wrong)
                        if (!hasConstants || !isConstantsCorrect) {
                            wrongTerms.add(term);
                        }
                    }
                }
            });

            // Build final latex
            let finalLatex = "";
            terms.forEach((term, index) => {
                let isNeg = false;
                let renderTerm = term;
                if (term.isOperatorNode && term.op === '*' && term.args[0].isConstantNode && term.args[0].value === -1) {
                    isNeg = true;
                    renderTerm = term.args[1];
                }

                let l = this.toLatex(renderTerm);
                if (wrongTerms.has(term)) {
                    l = `{\\color{red} ${l} }`;
                }

                if (index === 0) {
                    finalLatex += (isNeg ? '-' : '') + l;
                } else {
                    finalLatex += (isNeg ? ' - ' : ' + ') + l;
                }
            });

            katex.render(finalLatex, previewEl, { throwOnError: false });
        } catch (e) {
            console.error("General parse error", e);
            katex.render(`{\\color{red} ${this.toLatex(val)} }`, previewEl, { throwOnError: false });
        }
    },

    getTermRoot(node) {
        let root = null;
        node.traverse(n => {
            if (n.isOperatorNode && (n.op === '+' || n.op === '-')) {
                const hasX = n.args.some(a => a.toString().includes('x'));
                const cNode = n.args.find(a => a.isConstantNode);
                if (hasX && cNode) {
                    root = (n.op === '+') ? -cNode.value : cNode.value;
                }
            }
        });
        return root;
    },

    isConstantCorrectInTerm(term, cNode, target) {
        if (!target) return false;
        const val = cNode.value;
        if (val === Math.abs(target.root) || val === Math.abs(target.res)) return true;

        try {
            const testVar = '___c___';
            const testNode = term.transform(n => n === cNode ? new math.SymbolNode(testVar) : n);
            const compiled = testNode.compile();

            const check = (cValue) => {
                const x = target.root + 0.1;
                const v = compiled.evaluate({ x, [testVar]: cValue });
                const targetV = math.evaluate(`(${target.res})/(x - ${target.root})`, { x });
                return Math.abs(v - targetV) < 1e-5;
            };
            return check(val);
        } catch (e) { return true; }
    },

    checkStep2Factors(id, val) {
        const hintEl = document.getElementById(`hint-${id}`);
        const previewEl = document.getElementById(`preview-${id}`);

        try {
            const normalizedVal = val.replace(/\s+/g, '');
            const userFactors = normalizedVal.split(/[\(\)]+/).filter(f => f.trim().length > 0);
            const targetFactors = this.currentProblem.factors.map(f => f.str.replace(/[\(\)]/g, '').replace(/\s+/g, ''));

            let feedbackLatex = "";
            let allCorrect = true;

            userFactors.forEach(uf => {
                const isMatch = targetFactors.some(tf => this.compareExpressions(uf, tf));
                if (isMatch) {
                    feedbackLatex += `(${this.toLatex(uf)})`;
                } else {
                    feedbackLatex += `{\\color{red}(${this.toLatex(uf)})}`;
                    allCorrect = false;
                }
            });

            if (!allCorrect) {
                katex.render(feedbackLatex, previewEl, { throwOnError: false });
                hintEl.innerHTML = "Some factors appear to be incorrect. Check the red parts.";
                hintEl.style.display = 'block';
            }
        } catch (e) {
            hintEl.innerHTML = "Ensure your factors are written clearly, e.g., (x+1)(x-2)";
            hintEl.style.display = 'block';
        }
    },

    provideDecompositionHints(id, val) {
        const hintEl = document.getElementById(`hint-${id}`);

        // Case: Missing term for repeated linear factor (ax+b)^2
        const hasRepeated = this.currentProblem.factors.some(f => f.deg === 2 && f.str.includes('^2'));
        if (hasRepeated) {
            const repeatedFactor = this.currentProblem.factors.find(f => f.deg === 2 && f.str.includes('^2'));
            const baseFactor = repeatedFactor.str.split('^')[0].replace(/\s+/g, ''); // e.g. (x+1)
            const normalizedVal = val.replace(/\s+/g, '');

            // Count occurrences of base factor in user input
            const baseMatches = (normalizedVal.match(new RegExp(baseFactor.replace(/[\(\)\+\-]/g, '\\$&'), 'g')) || []).length;
            if (baseMatches < 2) {
                hintEl.innerHTML = "Check the partial fraction decomposition terms again, you are missing one term.";
                hintEl.style.display = 'block';
                return;
            }
        }

        // Case: Correct structure but wrong constants
        // We check if it's correct when constants A, B, C are variables, 
        // but wrong when they are treated as their actual values (if user put numbers)
        // Actually, our compareExpressions already handles A, B, C as symbols.
        // If the user entered numbers and it failed, then compare it with symbols.

        if (/[0-9]/.test(val) && !/[A-E]/.test(val)) {
            // Check if it's correct when we treat the numbers as "possible constants"
            // This is hard to do generally, but we can check if it's mathematically equivalent 
            // TO THE ORIGINAL if user input had A, B, C instead. 
            // Simpler: If the user didn't use A, B, C but has fractions, suggest checking constants.
            hintEl.innerHTML = "Check the constants again.";
            hintEl.style.display = 'block';
        }
    },
    normalizeMathExpression(s) {
        if (!s) return "";
        let res = s.toString().replace(/\s+/g, '');
        // Auto-group factors in denominator: /(x+1)(x+2) -> /((x+1)(x+2))
        // This identifies a slash followed by 2 or more parenthesized factors.
        const f = '\\([^\\)]+\\)(?:\\^\\d+)?';
        const polyGroup = new RegExp('\\/(' + f + '(?:' + f + ')+)', 'g');
        res = res.replace(polyGroup, '/($1)');

        res = res.replace(/([0-9])([a-zA-Zx])/g, '$1*$2');
        res = res.replace(/([A-Ex])([A-Ex])/g, '$1*$2');
        res = res.replace(/([a-zA-Zx])([0-9])/g, '$1*$2');
        res = res.replace(/(\))([0-9a-zA-Zx])/g, '$1*$2');
        res = res.replace(/([0-9a-zA-Zx])(\()/g, '$1*$2');
        res = res.replace(/(\))(\()/g, '$1*$2');
        return res;
    },

    compareExpressions(userInput, targetRaw) {
        try {
            if (!userInput || !targetRaw) return false;

            const uNorm = this.normalizeMathExpression(userInput);
            const tNorm = this.normalizeMathExpression(targetRaw);

            const userExpr = math.parse(uNorm).compile();
            const targetExpr = math.parse(tNorm).compile();

            const points = [2.3, -1.7, 0.5, 3.1, -4.2];
            let validPoints = 0;
            for (let xNum of points) {
                const x = math.complex(xNum, 0.4);
                const constants = {
                    A: math.complex(2.1, 0.7),
                    B: math.complex(-1.3, 0.4),
                    C: math.complex(0.5, -1.1),
                    D: math.complex(1.4, 1.4),
                    E: math.complex(-0.8, -0.6)
                };

                const scope = { x, ...constants };
                const uVal = userExpr.evaluate(scope);
                const tVal = targetExpr.evaluate(scope);

                const diff = math.abs(math.subtract(uVal, tVal));
                if (typeof diff !== 'number' || isNaN(diff)) continue;
                validPoints++;

                if (diff > 1e-6) return false;
            }
            return validPoints > 0;
        } catch (e) {
            return false;
        }
    },

    verifyEquivalence(userInput) {
        return this.compareExpressions(userInput, this.currentProblem.raw);
    },

    toLatex(str, wrongNodes = new Set()) {
        if (!str) return "";
        try {
            const node = typeof str === 'string' ? math.parse(str) : str;
            return node.toTex({
                parenthesized: 'keep',
                implicit: 'hide',
                handler: (node, callback) => {
                    if (wrongNodes.has(node)) {
                        return `\\textcolor{red}{${node.value}}`;
                    }
                    // Custom handling for 1*variable and -1*variable
                    if (node.isOperatorNode && node.op === '*' && node.args.length === 2) {
                        if (node.args[0].isConstantNode && !wrongNodes.has(node.args[0])) {
                            if (node.args[0].value === 1) return callback(node.args[1]);
                            if (node.args[0].value === -1) return '-' + callback(node.args[1]);
                        }
                    }
                    return undefined;
                }
            }).replace(/\\cdot/g, "");
        } catch (e) { return typeof str === 'string' ? str : ""; }
    },

    clearWorkspace() {
        document.getElementById('steps-container').innerHTML = '';
        this.steps = [];
        document.getElementById('empty-state').style.display = 'block';
    },

    showSuccess(id) {
        confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#8b5cf6', '#06b6d4', '#10b981']
        });
        this.stopTimer();
        if (id) {
            const hintEl = document.getElementById(`hint-${id}`);
            hintEl.innerHTML = "<span style='color: var(--correct); font-weight: bold; font-size: 1rem;'>WELL DONE! Everything is correct!</span>";
            hintEl.style.display = 'block';
        }
    }
};

window.onload = () => app.init();
