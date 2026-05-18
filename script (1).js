// ============================================================
//  AI CODE REVIEWER — Complete Script
//  Features: Live prediction, history (10), scoring, diff view,
//  complexity analysis, beginner mode, export (TXT/JSON/MD/HTML),
//  file upload, snippets, light/dark toggle, line numbers,
//  Tab indent, format code, copy, clear, Ctrl+Enter shortcut
// ============================================================

// ── GLOBALS ──────────────────────────────────────────────────
let reviewHistory   = [];
let snippets        = [];
let currentReview   = null;
let beginnerMode    = false;
let typingTimer;
const MAX_HISTORY   = 10;
const MAX_SNIPPETS  = 20;

// ── BEGINNER EXPLANATIONS ────────────────────────────────────
const beginnerExplain = {
    "Use let/const instead of var":
        "💡 'var' is the old way to create variables. It can cause confusing bugs because it ignores block boundaries. Use 'let' when a value may change, and 'const' when it won't.",
    "Use strict equality (===)":
        "💡 '==' tries to convert types before comparing (e.g. '1' == 1 is true!). '===' checks both value AND type, so it's safer and more predictable.",
    "Add newline (\\n) in printf":
        "💡 In C/C++, printf() doesn't add a line break automatically. End your string with \\n to move to the next line in output.",
    "Use print() function (Python 3)":
        "💡 In Python 3, print is a function, so you need parentheses: print('hello') instead of print 'hello'.",
    "Use println instead of print (Java)":
        "💡 System.out.print() keeps the cursor on the same line. System.out.println() adds a newline at the end, which is usually what you want.",
    "Avoid empty catch blocks":
        "💡 An empty catch block silently swallows errors, making bugs nearly impossible to find. Always log or handle the error.",
    "Add error handling (try/catch) for fetch":
        "💡 Network requests can fail for many reasons. Wrap fetch() in try/catch so your app doesn't crash on a bad connection.",
    "Avoid == with null, use === null":
        "💡 Using === null is explicit and safe. == null also matches undefined, which can be surprising.",
    "Avoid console.log in production":
        "💡 console.log() is great for debugging but should be removed before shipping code to users.",
};

// ── DOM READY ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadFromStorage();
    setupEventListeners();
    renderSidebarHistory();
    updateStorageInfo();
    updateCharCount();
    syncLineNumbers();
});

// ── EVENT LISTENERS ──────────────────────────────────────────
function setupEventListeners() {
    const codeInput = document.getElementById('codeInput');

    // Review button & Ctrl+Enter
    document.getElementById('reviewBtn')?.addEventListener('click', onReview);
    codeInput?.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); onReview(); }
        // Tab → 4 spaces
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = codeInput.selectionStart;
            const end   = codeInput.selectionEnd;
            codeInput.value = codeInput.value.substring(0, start) + '    ' + codeInput.value.substring(end);
            codeInput.selectionStart = codeInput.selectionEnd = start + 4;
        }
    });

    // Live prediction on input
    codeInput?.addEventListener('input', () => {
        updateCharCount();
        detectLanguage();
        syncLineNumbers();
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => showLiveWarnings(codeInput.value), 400);
    });

    // Scroll sync for line numbers
    codeInput?.addEventListener('scroll', () => {
        document.getElementById('lineNumbers').scrollTop = codeInput.scrollTop;
    });

    // Clear editor
    document.getElementById('clearEditorBtn')?.addEventListener('click', () => {
        codeInput.value = '';
        updateCharCount();
        syncLineNumbers();
        document.getElementById('livePredictionInline').innerHTML = '';
        showToast('Editor cleared', 'info');
    });

    // Copy code
    document.getElementById('copyCodeBtn')?.addEventListener('click', () => {
        if (!codeInput.value) return showToast('Nothing to copy', 'error');
        navigator.clipboard.writeText(codeInput.value);
        showToast('Code copied!', 'success');
    });

    // Clear all history
    document.getElementById('clearAllHistoryBtn')?.addEventListener('click', () => {
        if (!reviewHistory.length) return showToast('History is already empty', 'info');
        if (!confirm('Clear all review history?')) return;
        reviewHistory = [];
        saveToStorage();
        renderSidebarHistory();
        updateStorageInfo();
        showToast('History cleared', 'info');
    });

    // Export all history
    document.getElementById('exportAllBtn')?.addEventListener('click', () => {
        if (!reviewHistory.length) return showToast('No history to export', 'error');
        const blob = new Blob([JSON.stringify(reviewHistory, null, 2)], { type: 'application/json' });
        downloadBlob(blob, 'code_review_history.json');
        showToast('History exported!', 'success');
    });

    // Beginner toggle
    document.getElementById('beginnerToggle')?.addEventListener('click', function () {
        beginnerMode = !beginnerMode;
        this.classList.toggle('active', beginnerMode);
        showToast(beginnerMode ? 'Beginner Mode ON 🎓' : 'Beginner Mode OFF', 'info');
        if (currentReview) displayResults(currentReview);
    });

    // Dark/Light toggle
    document.getElementById('darkToggleBtn')?.addEventListener('click', function () {
        document.body.classList.toggle('light-mode');
        const isLight = document.body.classList.contains('light-mode');
        this.innerHTML = isLight ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
        showToast(isLight ? 'Light Mode' : 'Dark Mode', 'info');
    });

    // Format code
    document.getElementById('formatCodeBtn')?.addEventListener('click', formatCode);

    // File upload
    document.getElementById('uploadCodeBtn')?.addEventListener('click', () => {
        document.getElementById('fileInput').click();
    });
    document.getElementById('fileInput')?.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
            codeInput.value = ev.target.result;
            updateCharCount();
            syncLineNumbers();
            detectLanguage();
            showToast(`Loaded: ${file.name}`, 'success');
        };
        reader.readAsText(file);
        e.target.value = '';
    });

    // Save snippet
    document.getElementById('saveSnippetBtn')?.addEventListener('click', () => {
        const code = codeInput.value.trim();
        if (!code) return showToast('Nothing to save', 'error');
        const name = prompt('Snippet name:', `Snippet ${snippets.length + 1}`);
        if (!name) return;
        snippets.unshift({ name, code, date: new Date().toLocaleString() });
        if (snippets.length > MAX_SNIPPETS) snippets.pop();
        saveToStorage();
        renderSnippets();
        document.getElementById('snippetsPanel').style.display = 'block';
        showToast(`Saved "${name}"`, 'success');
    });

    // Close snippets
    document.getElementById('closeSnippets')?.addEventListener('click', () => {
        document.getElementById('snippetsPanel').style.display = 'none';
    });

    // Sidebar toggle
    document.getElementById('sidebarToggle')?.addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('collapsed');
    });
}

// ── UTILS ────────────────────────────────────────────────────
function updateCharCount() {
    const val = document.getElementById('codeInput').value;
    document.getElementById('charCount').textContent = val.length.toLocaleString();
    document.getElementById('lineCount').textContent = val ? val.split('\n').length : 0;
}

function syncLineNumbers() {
    const ta    = document.getElementById('codeInput');
    const lines = ta.value ? ta.value.split('\n').length : 1;
    document.getElementById('lineNumbers').textContent =
        Array.from({ length: lines }, (_, i) => i + 1).join('\n');
}

function detectLanguage() {
    const code = document.getElementById('codeInput').value;
    const sel  = document.getElementById('languageSelect').value;
    const span = document.getElementById('detectedLang');
    if (!code.trim()) { span.textContent = ''; return; }
    if (sel !== 'auto') { span.textContent = `Selected: ${sel}`; return; }
    span.textContent = `Detected: ${guessLanguage(code)}`;
}

function guessLanguage(code) {
    if (code.includes('<?php'))                                   return 'PHP';
    if (code.includes('import React') || /jsx/.test(code))       return 'JSX/React';
    if (code.includes('fn main()') || code.includes('println!')) return 'Rust';
    if (code.includes('package main') || code.includes('func ')) return 'Go';
    if (code.includes('<!DOCTYPE') || /<html/i.test(code))       return 'HTML';
    if (code.includes('System.out') || code.includes('public class')) return 'Java';
    if (code.includes('#include') || code.includes('cout <<'))   return 'C++';
    if (code.includes('def ') && code.includes(':'))             return 'Python';
    if (/interface |: string|: number|: boolean/.test(code))     return 'TypeScript';
    if (code.includes('function') || code.includes('const ') || code.includes('=>')) return 'JavaScript';
    if (/\{[\s\S]*:[\s\S]*;/.test(code))                        return 'CSS';
    return 'Unknown';
}

function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

function showToast(msg, type = 'info') {
    const t = document.getElementById('toast');
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    t.innerHTML = `${icons[type] || ''} ${msg}`;
    t.className = `toast ${type} show`;
    setTimeout(() => t.classList.remove('show'), 3000);
}

function downloadBlob(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ── LIVE BUG PREDICTION ───────────────────────────────────────
function showLiveWarnings(code) {
    const container = document.getElementById('livePredictionInline');
    if (!code.trim()) { container.innerHTML = ''; return; }

    const warnings = [];

    if (/fetch\s*\(/.test(code) && !code.includes('try'))
        warnings.push('⚠️ fetch() without try/catch — network errors will crash your app');
    if (code.includes('==') && !code.includes('==='))
        warnings.push('⚠️ Use === instead of == to avoid type-coercion bugs');
    if (/\bvar\b/.test(code))
        warnings.push("⚠️ 'var' has function scope — prefer let or const");
    if (code.includes('"') && code.includes('+') && /\d/.test(code))
        warnings.push('⚠️ Possible string + number concatenation bug');
    if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(code))
        warnings.push('⚠️ Empty catch block — errors will be silently ignored');
    if (code.includes('console.log') && code.split('\n').length > 30)
        warnings.push('⚠️ console.log found — remove before production');
    if (/==\s*null(?!\=)/.test(code))
        warnings.push('⚠️ Use === null instead of == null for explicit checks');

    if (!warnings.length) { container.innerHTML = ''; return; }

    container.innerHTML = `
        <div class="live-warn-box">
            <div class="lw-header"><i class="fas fa-bolt"></i> Live Bug Prediction (${warnings.length} warning${warnings.length > 1 ? 's' : ''})</div>
            ${warnings.slice(0, 4).map(w => `<div class="line-comment">${w}</div>`).join('')}
        </div>`;
}

// ── FORMAT CODE ───────────────────────────────────────────────
function formatCode() {
    const ta   = document.getElementById('codeInput');
    let code   = ta.value;
    if (!code.trim()) return showToast('Nothing to format', 'error');

    // Basic JS-style formatting: normalize spacing around operators
    code = code
        .replace(/\t/g, '    ')
        .replace(/[ \t]+$/gm, '')          // trailing spaces
        .replace(/\n{3,}/g, '\n\n')        // max 2 blank lines
        .replace(/\{\s*\n/g, '{\n')
        .replace(/([,;])\s+/g, '$1 ');

    ta.value = code;
    syncLineNumbers();
    updateCharCount();
    showToast('Code formatted ✨', 'success');
}

// ── MAIN ANALYSIS ENGINE ──────────────────────────────────────
function analyzeCode(code) {
    const lang   = document.getElementById('languageSelect').value === 'auto'
                   ? guessLanguage(code) : document.getElementById('languageSelect').value;
    let score    = 10;
    const issues = [];
    let improved = code;

    // ── JS / TS ──
    if (/javascript|typescript|auto/i.test(lang) || lang === 'Unknown') {
        if (/\bvar\b/.test(code)) {
            issues.push({ text: 'Use let/const instead of var', sev: 'warn' });
            score -= 2;
            improved = improved.replace(/\bvar\b/g, 'let');
        }
        if (code.includes('==') && !code.includes('===')) {
            issues.push({ text: 'Use strict equality (===)', sev: 'warn' });
            score -= 2;
            improved = improved.replace(/([^!=<>])={2}(?!=)/g, '$1===');
        }
        if (/fetch\s*\(/.test(code) && !code.includes('try')) {
            issues.push({ text: 'Add error handling (try/catch) for fetch', sev: 'error' });
            score -= 2;
        }
        if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(code)) {
            issues.push({ text: 'Avoid empty catch blocks', sev: 'error' });
            score -= 1;
        }
        if (code.includes('console.log') && code.split('\n').length > 20) {
            issues.push({ text: 'Avoid console.log in production', sev: 'info' });
            score -= 1;
        }
    }

    // ── C / C++ ──
    if (/c\+\+|cpp|c$/i.test(lang) || code.includes('#include')) {
        if (code.includes('printf(') && !code.includes('\\n')) {
            issues.push({ text: 'Add newline (\\n) in printf', sev: 'warn' });
            score -= 1;
        }
        if (code.includes('gets(')) {
            issues.push({ text: 'gets() is unsafe — use fgets() instead', sev: 'error' });
            score -= 2;
            improved = improved.replace(/\bgets\s*\(/g, 'fgets(');
        }
        if (/int\s+main\s*\(\s*\)/.test(code) && !code.includes('return 0')) {
            issues.push({ text: 'main() should return 0', sev: 'info' });
            score -= 1;
        }
    }

    // ── Python ──
    if (/python/i.test(lang) || code.includes('def ')) {
        if (code.includes('print ') && !code.includes('print(')) {
            issues.push({ text: 'Use print() function (Python 3)', sev: 'warn' });
            score -= 2;
            improved = improved.replace(/\bprint\s+(['"])/g, "print($1");
        }
        if (/except\s*:/g.test(code)) {
            issues.push({ text: 'Avoid bare except — specify exception type', sev: 'warn' });
            score -= 1;
        }
        if (code.includes('import *')) {
            issues.push({ text: "Avoid 'import *' — import only what you need", sev: 'info' });
            score -= 1;
        }
    }

    // ── Java ──
    if (/java/i.test(lang) || code.includes('System.out')) {
        if (code.includes('System.out.print') && !code.includes('println')) {
            issues.push({ text: 'Use println instead of print (Java)', sev: 'info' });
            score -= 1;
            improved = improved.replace(/System\.out\.print\(/g, 'System.out.println(');
        }
        if (code.includes('catch (Exception e)') && code.includes('{}')) {
            issues.push({ text: 'Avoid empty catch blocks', sev: 'error' });
            score -= 1;
        }
    }

    // ── HTML ──
    if (/html/i.test(lang) || /<html/i.test(code)) {
        if (!code.includes('<!DOCTYPE')) {
            issues.push({ text: 'Add <!DOCTYPE html> declaration', sev: 'warn' });
            score -= 1;
        }
        if (!code.includes('lang=')) {
            issues.push({ text: 'Add lang attribute to <html> tag', sev: 'info' });
            score -= 1;
        }
        if (!/<meta\s+charset/i.test(code)) {
            issues.push({ text: 'Add <meta charset="UTF-8"> in <head>', sev: 'info' });
            score -= 1;
        }
        if (/<img(?![^>]*alt=)/i.test(code)) {
            issues.push({ text: 'Add alt attribute to <img> tags (accessibility)', sev: 'warn' });
            score -= 1;
        }
    }

    // ── CSS ──
    if (/css/i.test(lang) || /\{[\s\S]*:[\s\S]*;/.test(code)) {
        if (!code.includes('box-sizing') && code.length > 100) {
            issues.push({ text: "Consider adding 'box-sizing: border-box'", sev: 'info' });
        }
        if (code.includes('!important')) {
            issues.push({ text: "Avoid overusing '!important' — it makes debugging harder", sev: 'warn' });
            score -= 1;
        }
    }

    // ── General ──
    const lines = code.split('\n');
    if (lines.length > 5 && !code.includes('//') && !code.includes('/*') && !code.includes('#')) {
        issues.push({ text: 'Consider adding comments to explain your code', sev: 'info' });
    }
    const longLines = lines.filter(l => l.length > 100);
    if (longLines.length > 2) {
        issues.push({ text: `${longLines.length} lines exceed 100 characters — consider breaking them up`, sev: 'info' });
    }

    if (score < 0) score = 0;

    // ── Complexity estimate ──
    const cyclomatic = (code.match(/\b(if|else|for|while|switch|case|catch|&&|\|\|)\b/g) || []).length;
    const complexity = cyclomatic > 15 ? 'high' : cyclomatic > 7 ? 'medium' : 'low';

    // ── Metrics ──
    const metrics = {
        lines:      lines.length,
        blankLines: lines.filter(l => !l.trim()).length,
        chars:      code.length,
        functions:  (code.match(/function\s+\w+\s*\(|def\s+\w+\s*\(|public\s+\w+\s+\w+\s*\(/g) || []).length,
        comments:   (code.match(/\/\/|\/\*|#\s/g) || []).length,
        cyclomatic,
        complexity,
        lang,
    };

    return { score, issues, improved, metrics };
}

// ── DIFF GENERATOR ────────────────────────────────────────────
function generateDiff(original, improved) {
    const orig = original.split('\n');
    const impr = improved.split('\n');
    const out  = [];
    const maxLen = Math.max(orig.length, impr.length);

    for (let i = 0; i < maxLen; i++) {
        const o = orig[i];
        const n = impr[i];
        if (o === undefined)       out.push(`<div class="diff-line diff-add">+ ${escapeHtml(n)}</div>`);
        else if (n === undefined)  out.push(`<div class="diff-line diff-remove">- ${escapeHtml(o)}</div>`);
        else if (o !== n) {
            out.push(`<div class="diff-line diff-remove">- ${escapeHtml(o)}</div>`);
            out.push(`<div class="diff-line diff-add">+ ${escapeHtml(n)}</div>`);
        } else                     out.push(`<div class="diff-line diff-neutral">  ${escapeHtml(o)}</div>`);
    }
    return out.join('');
}

// ── DISPLAY RESULTS ───────────────────────────────────────────
function displayResults(review) {
    const { score, issues, improved, metrics } = review;
    const orig      = document.getElementById('codeInput').value;
    const container = document.getElementById('resultsContainer');

    const scoreColor = score >= 8 ? '#6ee7b7' : score >= 5 ? '#fbbf24' : '#f87171';
    const scoreBarW  = `${score * 10}%`;
    const circumference = 2 * Math.PI * 28;
    const offset     = circumference - (score / 10) * circumference;

    const compClass  = `complexity-${metrics.complexity}`;
    const compLabel  = metrics.complexity.charAt(0).toUpperCase() + metrics.complexity.slice(1);

    // Build issue HTML
    const issueHtml = issues.length
        ? issues.map(iss => {
            const sev   = iss.sev || 'warn';
            const icon  = { error: 'fa-times-circle', warn: 'fa-exclamation-triangle', info: 'fa-info-circle' }[sev] || 'fa-exclamation-triangle';
            const tip   = beginnerMode && beginnerExplain[iss.text]
                          ? `<div class="beginner-tip">${beginnerExplain[iss.text]}</div>` : '';
            return `<div class="issue-item ${sev}"><i class="fas ${icon}"></i><div><span>${iss.text}</span>${tip}</div></div>`;
        }).join('')
        : `<div style="color:#6ee7b7;display:flex;align-items:center;gap:8px;"><i class="fas fa-check-circle"></i> No major issues found! Great code 🎉</div>`;

    // Diff
    const hasDiff = orig !== improved;
    const diffHtml = hasDiff ? generateDiff(orig, improved) : '<div style="color:var(--text-muted)">No automatic fixes were applied.</div>';

    container.innerHTML = `<div class="results-grid">

        <!-- Score Card -->
        <div class="result-card">
            <div class="card-header">
                <i class="fas fa-star" style="color:#fbbf24"></i> Code Quality Score
            </div>
            <div class="card-content">
                <div class="score-ring">
                    <svg class="ring-svg" width="70" height="70" viewBox="0 0 70 70">
                        <circle class="ring-bg" cx="35" cy="35" r="28"/>
                        <circle class="ring-fill" cx="35" cy="35" r="28"
                            stroke="${scoreColor}"
                            stroke-dasharray="${circumference}"
                            stroke-dashoffset="${offset}"/>
                    </svg>
                    <div>
                        <div style="font-size:2rem;font-weight:700;color:${scoreColor};font-family:'JetBrains Mono',monospace">${score}<span style="font-size:1rem;color:var(--text-muted)">/10</span></div>
                        <div style="font-size:0.75rem;color:var(--text-muted)">${score >= 8 ? 'Excellent' : score >= 6 ? 'Good' : score >= 4 ? 'Needs Work' : 'Poor'}</div>
                    </div>
                </div>
                <div class="score-bar-wrap">
                    <div class="score-bar-bg"><div class="score-bar-fill" style="width:${scoreBarW};background:${scoreColor}"></div></div>
                    <span class="score-label" style="color:${scoreColor}">${score * 10}%</span>
                </div>
                <div class="stats-row">
                    <div class="stat-chip"><i class="fas fa-code"></i> ${metrics.lines} lines</div>
                    <div class="stat-chip"><i class="fas fa-comment"></i> ${metrics.comments} comments</div>
                    <div class="stat-chip"><i class="fas fa-cube"></i> ${metrics.functions} fn${metrics.functions !== 1 ? 's' : ''}</div>
                    <div class="stat-chip"><i class="fas fa-tag"></i> ${metrics.lang}</div>
                </div>
                <div style="margin-top:10px">
                    Cyclomatic complexity:
                    <span class="complexity-badge ${compClass}">${compLabel} (${metrics.cyclomatic})</span>
                </div>
            </div>
        </div>

        <!-- Issues Card -->
        <div class="result-card">
            <div class="card-header">
                <i class="fas fa-bug" style="color:var(--warn)"></i>
                Issues Found (${issues.length})
                ${beginnerMode ? '<span style="font-size:0.7rem;margin-left:auto;color:var(--accent2);background:#1c1330;padding:2px 8px;border-radius:10px;">🎓 Beginner Mode</span>' : ''}
            </div>
            <div class="card-content">${issueHtml}</div>
        </div>

        <!-- Original Code -->
        <div class="result-card">
            <div class="card-header"><i class="fas fa-file-code" style="color:var(--text-muted)"></i> Original Code</div>
            <div class="card-content">
                <div class="code-improved">${escapeHtml(orig)}</div>
                <div class="action-buttons">
                    <button class="copy-btn" onclick="copyText(${JSON.stringify(orig)})"><i class="far fa-copy"></i> Copy</button>
                </div>
            </div>
        </div>

        <!-- Improved Code -->
        <div class="result-card">
            <div class="card-header"><i class="fas fa-magic" style="color:var(--accent)"></i> Improved Code</div>
            <div class="card-content">
                <div class="code-improved" id="improvedCodeBlock">${escapeHtml(improved)}</div>
                <div class="action-buttons">
                    <button class="copy-btn" onclick="copyText(${JSON.stringify(improved)})"><i class="far fa-copy"></i> Copy</button>
                    <button class="copy-btn" onclick="loadImproved()"><i class="fas fa-arrow-up"></i> Load into editor</button>
                    <button class="export-btn" onclick="document.getElementById('exportModal').style.display='flex'"><i class="fas fa-download"></i> Export</button>
                </div>
            </div>
        </div>

        <!-- Diff View -->
        <div class="result-card" style="grid-column: 1 / -1">
            <div class="card-header"><i class="fas fa-exchange-alt" style="color:var(--success)"></i> Diff View (Changes)</div>
            <div class="card-content">
                <div class="code-improved" style="max-height:220px">${diffHtml}</div>
            </div>
        </div>

    </div>`;
}

// ── REVIEW BUTTON HANDLER ─────────────────────────────────────
async function onReview() {
    const code = document.getElementById('codeInput').value.trim();
    if (!code) return showToast('Please enter some code first!', 'error');

    const btn = document.getElementById('reviewBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing...';

    document.getElementById('resultsContainer').innerHTML = `
        <div class="loading">
            <i class="fas fa-cog"></i>
            <div>Analyzing your code...</div>
        </div>`;

    // Small async delay so the UI updates before heavy work
    await new Promise(r => setTimeout(r, 600));

    try {
        const review = analyzeCode(code);
        currentReview = review;
        currentReview._code = code;
        displayResults(review);
        saveReviewToHistory(code, review);
    } catch (err) {
        document.getElementById('resultsContainer').innerHTML = `
            <div class="error-msg">
                <i class="fas fa-times-circle" style="color:var(--error)"></i>
                <span>Analysis failed: ${err.message}</span>
            </div>`;
    }

    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-magnifying-glass"></i> Review Code';
}

// ── HELPERS (global, called from HTML) ───────────────────────
function copyText(text) {
    navigator.clipboard.writeText(text).then(() => showToast('Copied!', 'success'));
}

function loadImproved() {
    if (!currentReview) return;
    document.getElementById('codeInput').value = currentReview.improved;
    updateCharCount();
    syncLineNumbers();
    showToast('Improved code loaded into editor', 'success');
}

// ── EXPORT ───────────────────────────────────────────────────
function exportAs(format) {
    if (!currentReview) return showToast('No review to export', 'error');
    const { score, issues, improved, metrics } = currentReview;
    const orig = currentReview._code || '';
    const date = new Date().toLocaleString();

    let content, filename, mime;

    if (format === 'txt') {
        content = [
            '=== AI CODE REVIEWER REPORT ===',
            `Date: ${date}`,
            `Language: ${metrics.lang}`,
            `Score: ${score}/10`,
            `Complexity: ${metrics.complexity} (${metrics.cyclomatic})`,
            '',
            '--- ISSUES ---',
            ...(issues.length ? issues.map(i => `• [${i.sev}] ${i.text}`) : ['No issues found.']),
            '',
            '--- ORIGINAL CODE ---',
            orig,
            '',
            '--- IMPROVED CODE ---',
            improved,
        ].join('\n');
        filename = 'code_review.txt';
        mime = 'text/plain';
    } else if (format === 'json') {
        content = JSON.stringify({ date, score, metrics, issues, original: orig, improved }, null, 2);
        filename = 'code_review.json';
        mime = 'application/json';
    } else if (format === 'md') {
        content = [
            '# AI Code Review Report',
            `**Date:** ${date}  `,
            `**Language:** ${metrics.lang}  `,
            `**Score:** ${score}/10  `,
            `**Complexity:** ${metrics.complexity} (${metrics.cyclomatic})  `,
            '',
            '## Issues',
            ...(issues.length ? issues.map(i => `- **[${i.sev}]** ${i.text}`) : ['_No issues found._']),
            '',
            '## Original Code',
            '```',
            orig,
            '```',
            '',
            '## Improved Code',
            '```',
            improved,
            '```',
        ].join('\n');
        filename = 'code_review.md';
        mime = 'text/markdown';
    } else if (format === 'html') {
        content = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Code Review Report</title>
<style>body{font-family:sans-serif;background:#0a0c10;color:#eef2ff;padding:32px}
h1{color:#8eabff}pre{background:#111;padding:16px;border-radius:8px;overflow:auto;font-size:13px}
.score{font-size:2rem;font-weight:700;color:${score>=8?'#6ee7b7':score>=5?'#fbbf24':'#f87171'}}
.issue{background:#1a1e2a;border-left:3px solid #f5a97f;padding:8px 12px;margin:6px 0;border-radius:4px}
</style></head><body>
<h1>AI Code Review Report</h1>
<p>Date: ${date} | Language: ${metrics.lang}</p>
<div class="score">${score}/10</div>
<h2>Issues (${issues.length})</h2>
${issues.map(i=>`<div class="issue">[${i.sev}] ${i.text}</div>`).join('')||'<p>No issues found.</p>'}
<h2>Original Code</h2><pre>${escapeHtml(orig)}</pre>
<h2>Improved Code</h2><pre>${escapeHtml(improved)}</pre>
</body></html>`;
        filename = 'code_review.html';
        mime = 'text/html';
    }

    const blob = new Blob([content], { type: mime });
    downloadBlob(blob, filename);
    document.getElementById('exportModal').style.display = 'none';
    showToast(`Exported as ${format.toUpperCase()}`, 'success');
}

// ── HISTORY ───────────────────────────────────────────────────
function saveReviewToHistory(code, review) {
    const entry = {
        id:       Date.now(),
        code,
        score:    review.score,
        issues:   review.issues.length,
        lang:     review.metrics.lang,
        improved: review.improved,
        metrics:  review.metrics,
        date:     new Date().toLocaleString(),
    };
    reviewHistory.unshift(entry);
    if (reviewHistory.length > MAX_HISTORY) reviewHistory.pop();
    saveToStorage();
    renderSidebarHistory();
    updateStorageInfo();
}

function renderSidebarHistory() {
    const list = document.getElementById('historyList');
    if (!reviewHistory.length) {
        list.innerHTML = `<div class="empty-state"><i class="fas fa-code"></i><p>No reviews yet.<br>Start by reviewing code!</p></div>`;
        return;
    }
    list.innerHTML = reviewHistory.map((h, idx) => `
        <div class="history-card" onclick="loadHistoryItem(${idx})">
            <div class="history-card-header">
                <span class="history-lang">${h.lang}</span>
                <span class="history-score">${h.score}/10</span>
                <button class="delete-review-btn" onclick="event.stopPropagation();deleteHistoryItem(${idx})" title="Delete">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="history-preview">${escapeHtml(h.code.trim().slice(0, 70))}</div>
            <div class="history-date">
                <i class="fas fa-clock" style="font-size:0.6rem"></i> ${h.date} &nbsp;·&nbsp; ${h.issues} issue${h.issues !== 1 ? 's' : ''}
            </div>
        </div>`).join('');
}

function loadHistoryItem(idx) {
    const h = reviewHistory[idx];
    if (!h) return;
    document.getElementById('codeInput').value = h.code;
    updateCharCount();
    syncLineNumbers();
    detectLanguage();
    // Re-analyse and display
    const review = analyzeCode(h.code);
    currentReview = review;
    currentReview._code = h.code;
    displayResults(review);
    showToast('History item loaded', 'info');
}

function deleteHistoryItem(idx) {
    reviewHistory.splice(idx, 1);
    saveToStorage();
    renderSidebarHistory();
    updateStorageInfo();
    showToast('Review deleted', 'info');
}

function updateStorageInfo() {
    document.getElementById('storageCount').textContent = reviewHistory.length;
}

// ── SNIPPETS ──────────────────────────────────────────────────
function renderSnippets() {
    const list = document.getElementById('snippetsList');
    if (!snippets.length) { list.innerHTML = '<div style="padding:16px;color:var(--text-muted);font-size:0.82rem">No snippets saved.</div>'; return; }
    list.innerHTML = snippets.map((s, i) => `
        <div class="snippet-item">
            <div>
                <div class="snippet-name">${escapeHtml(s.name)}</div>
                <div class="snippet-preview">${escapeHtml(s.code.trim().slice(0, 60))}</div>
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0">
                <button class="copy-btn" onclick="loadSnippet(${i})"><i class="fas fa-upload"></i></button>
                <button class="copy-btn" onclick="deleteSnippet(${i})" style="color:var(--error)"><i class="fas fa-trash"></i></button>
            </div>
        </div>`).join('');
}

function loadSnippet(i) {
    document.getElementById('codeInput').value = snippets[i].code;
    updateCharCount();
    syncLineNumbers();
    detectLanguage();
    showToast(`Snippet "${snippets[i].name}" loaded`, 'success');
}

function deleteSnippet(i) {
    snippets.splice(i, 1);
    saveToStorage();
    renderSnippets();
}

// ── STORAGE ───────────────────────────────────────────────────
function saveToStorage() {
    try {
        localStorage.setItem('aiCodeReviews', JSON.stringify(reviewHistory));
        localStorage.setItem('aiCodeSnippets', JSON.stringify(snippets));
    } catch (e) { /* quota exceeded — silently ignore */ }
}

function loadFromStorage() {
    try {
        const h = localStorage.getItem('aiCodeReviews');
        const s = localStorage.getItem('aiCodeSnippets');
        if (h) reviewHistory = JSON.parse(h);
        if (s) snippets      = JSON.parse(s);
    } catch (e) {
        reviewHistory = [];
        snippets      = [];
    }
}
