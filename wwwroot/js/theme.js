// ── Theme Manager ──────────────────────────────────────────────
(function () {
    var STORAGE_KEY = 'tr_theme';
    var DEFAULT     = 'dark';

    function getSaved() {
        try { return localStorage.getItem(STORAGE_KEY) || DEFAULT; }
        catch (e) { return DEFAULT; }
    }

    function save(theme) {
        try { localStorage.setItem(STORAGE_KEY, theme); }
        catch (e) { }
    }

    function apply(theme) {
        document.documentElement.classList.remove('theme-dark', 'theme-light');
        document.documentElement.classList.add('theme-' + theme);
        document.body.classList.remove('theme-dark', 'theme-light');
        document.body.classList.add('theme-' + theme);
        updateButtons(theme);

        // If we're on the editor page, reapply cell styles
        // so color-coded grades stay visible in light theme
        if (typeof colorCodeAllCells === 'function') {
            setTimeout(colorCodeAllCells, 50);
        }
        if (typeof reapplyAllStyles === 'function') {
            setTimeout(reapplyAllStyles, 80);
        }
    }

    function updateButtons(theme) {
        var btns = document.querySelectorAll('.theme-toggle-btn');
        btns.forEach(function (btn) {
            if (theme === 'dark') {
                btn.textContent = '☀️';
                btn.title       = 'Переключиться на светлую тему';
            } else {
                btn.textContent = '🌙';
                btn.title       = 'Переключиться на темную тему';
            }
        });
    }

    function toggle() {
        var current = getSaved();
        var next    = current === 'dark' ? 'light' : 'dark';
        save(next);
        apply(next);
    }

    // Apply saved theme immediately on page load
    // (before DOM is fully ready to prevent flash)
    var saved = getSaved();
    document.documentElement.classList.remove('theme-dark', 'theme-light');
    document.documentElement.classList.add('theme-' + saved);
    if (document.body) {
        apply(saved);
    } else {
        document.addEventListener('DOMContentLoaded', function () {
            apply(saved);
        });
    }

    // Expose globally
    window.toggleTheme = toggle;
    window.applyTheme  = apply;
    window.getSavedTheme = getSaved;
})();