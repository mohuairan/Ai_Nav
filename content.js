(function() {
    'use strict';

    // 防止重复注入
    if (document.getElementById('ai-nav-container')) return;

    // --- 0. 策略定义 ---
    const STRATEGIES = {
        gemini: {
            name: 'Gemini',
            querySelector: 'user-query, .user-query, [data-message-id]', 
            getText: (node) => node.textContent.trim()
        },
        chatgpt: {
            name: 'ChatGPT',
            querySelector: '[data-message-author-role="user"]',
            getText: (node) => node.textContent.trim()
        }
    };

    // --- 1. 环境与存储检测 ---
    let currentStrategy = null;
    const host = window.location.hostname;
    if (host.includes('gemini.google')) currentStrategy = STRATEGIES.gemini;
    else if (host.includes('chatgpt.com') || host.includes('openai.com')) currentStrategy = STRATEGIES.chatgpt;
    else return;

    // 获取存储的模式：'auto' | 'dark' | 'light'，默认为 'auto'
    const STORAGE_KEY = 'ai_nav_theme_mode';
    let currentThemeMode = localStorage.getItem(STORAGE_KEY) || 'auto';

    // --- 2. 样式注入 (CSS 变量系统) ---
    const styleTag = document.createElement('style');
    styleTag.textContent = `
        :root {
            /* 默认深色变量 */
            --nav-bg-color: 30, 31, 32;
            --nav-text: #e3e3e3;
            --nav-border: #555;
            --nav-header-bg: rgba(255, 255, 255, 0.05);
            --nav-item-bg: rgba(255, 255, 255, 0.03);
            --nav-item-hover: rgba(255, 255, 255, 0.1);
            --nav-accent: #8ab4f8;
            --scrollbar-thumb: #666;
            --icon-color: #aaa;
            --icon-hover: #fff;
        }
        /* 浅色模式覆盖 */
        [data-ai-theme="light"] {
            --nav-bg-color: 248, 249, 250;
            --nav-text: #1f1f1f;
            --nav-border: #d0d7de;
            --nav-header-bg: rgba(0, 0, 0, 0.05);
            --nav-item-bg: rgba(0, 0, 0, 0.03);
            --nav-item-hover: rgba(0, 0, 0, 0.08);
            --nav-accent: #0056b3;
            --scrollbar-thumb: #bbb;
            --icon-color: #666;
            --icon-hover: #000;
        }
        #ai-nav-container {
            font-family: sans-serif;
            transition: color 0.3s, border-color 0.3s, box-shadow 0.3s;
        }
        #ai-nav-list::-webkit-scrollbar { width: 5px; height: 5px; }
        #ai-nav-list::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 3px; }
        .nav-item { 
            padding: 6px 8px; margin-bottom: 4px; font-size: 12px; 
            color: var(--nav-text); background: var(--nav-item-bg); 
            border-radius: 6px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; 
            border-left: 3px solid transparent; transition: all 0.2s; 
        }
        .nav-item:hover { background: var(--nav-item-hover); border-left: 3px solid var(--nav-accent); }
        .nav-controls { display: flex; align-items: center; gap: 8px; }
        .icon-btn { cursor: pointer; font-size: 14px; color: var(--icon-color); transition: color 0.2s; user-select: none; }
        .icon-btn:hover { color: var(--icon-hover); transform: scale(1.1); }
        #opacity-slider { width: 50px; height: 4px; accent-color: var(--nav-accent); cursor: pointer; }
    `;
    document.head.appendChild(styleTag);

    // --- 3. DOM 初始化 ---
    const container = document.createElement('div');
    container.id = 'ai-nav-container';
    container.setAttribute('data-ai-theme', 'dark'); // 初始默认

    // 根据当前模式决定按钮图标
    const getThemeIcon = (mode) => {
        if (mode === 'auto') return '🌗'; // 半月代表跟随
        if (mode === 'dark') return '🌙';
        if (mode === 'light') return '☀️';
        return '🌗';
    };

    container.innerHTML = `
        <div id="ai-nav-header">
            <span id="ai-nav-title" style="font-size:13px; font-weight:bold; color:var(--nav-text)">${currentStrategy.name}</span>
            <div class="nav-controls">
                <span id="theme-toggle-btn" class="icon-btn" title="切换模式: 自动/深色/浅色">${getThemeIcon(currentThemeMode)}</span>
                
                <input type="range" id="opacity-slider" min="0.2" max="1" step="0.05" value="0.95" title="调整透明度">
                <span id="nav-scroll-bottom" class="icon-btn" title="跳到底部">⬇</span>
                <span id="nav-refresh-btn" class="icon-btn" title="刷新列表">↻</span>
            </div>
        </div>
        <div id="ai-nav-list"></div>
    `;
    
    container.style.cssText = `
        position: fixed; top: 80px; right: 20px; width: 220px; height: 300px;
        background: rgba(var(--nav-bg-color), 0.95); 
        border: 1px solid var(--nav-border); 
        border-radius: 12px; z-index: 9999; display: flex; flex-direction: column;
        box-shadow: 0 8px 24px rgba(0,0,0,0.15); backdrop-filter: blur(5px);
        resize: both; overflow: hidden;
    `;
    
    const header = container.querySelector('#ai-nav-header');
    header.style.cssText = `
        padding: 10px; background: var(--nav-header-bg); border-bottom: 1px solid var(--nav-border);
        display: flex; align-items: center; justify-content: space-between; cursor: move; user-select: none;
    `;
    
    const listElement = container.querySelector('#ai-nav-list');
    listElement.style.cssText = "flex: 1; overflow-y: auto; padding: 8px; margin: 0;";

    document.body.appendChild(container);

    // --- 4. 核心功能：主题控制逻辑 ---
    
    // 应用主题的统一入口
    function applyTheme() {
        const themeBtn = document.getElementById('theme-toggle-btn');
        let targetTheme = 'dark'; // 最终应用的主题

        // 1. 更新按钮图标
        themeBtn.textContent = getThemeIcon(currentThemeMode);

        // 2. 决定颜色
        if (currentThemeMode === 'auto') {
            // 自动检测逻辑
            const bgColor = window.getComputedStyle(document.body).backgroundColor;
            const rgb = bgColor.match(/\d+/g);
            if (rgb) {
                const brightness = (parseInt(rgb[0]) * 299 + parseInt(rgb[1]) * 587 + parseInt(rgb[2]) * 114) / 1000;
                targetTheme = brightness > 140 ? 'light' : 'dark';
            }
            themeBtn.title = "当前模式: 自动跟随 (Auto)";
        } else {
            // 强制逻辑
            targetTheme = currentThemeMode;
            themeBtn.title = `当前模式: 强制${currentThemeMode === 'dark' ? '深色' : '浅色'}`;
        }

        // 3. 设置属性
        if (container.getAttribute('data-ai-theme') !== targetTheme) {
            container.setAttribute('data-ai-theme', targetTheme);
        }
    }

    // 绑定切换按钮点击事件
    document.getElementById('theme-toggle-btn').addEventListener('click', () => {
        // 循环切换：auto -> dark -> light -> auto
        if (currentThemeMode === 'auto') currentThemeMode = 'dark';
        else if (currentThemeMode === 'dark') currentThemeMode = 'light';
        else currentThemeMode = 'auto';

        // 保存选择并应用
        localStorage.setItem(STORAGE_KEY, currentThemeMode);
        applyTheme();
    });

    // --- 5. 交互功能 (拖拽/透明度/刷新) ---
    container.querySelector('#opacity-slider').addEventListener('input', (e) => {
        container.style.background = `rgba(var(--nav-bg-color), ${e.target.value})`;
    });

    let isDragging = false, startX, startY, initialLeft, initialTop;
    header.addEventListener('mousedown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.classList.contains('icon-btn')) return;
        isDragging = true;
        startX = e.clientX; startY = e.clientY;
        const rect = container.getBoundingClientRect();
        initialLeft = rect.left; initialTop = rect.top;
        container.style.right = 'auto'; container.style.bottom = 'auto';
        container.style.width = rect.width + 'px'; container.style.height = rect.height + 'px';
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
    function onMouseMove(e) {
        if (!isDragging) return;
        container.style.left = `${initialLeft + (e.clientX - startX)}px`;
        container.style.top = `${initialTop + (e.clientY - startY)}px`;
    }
    function onMouseUp() {
        isDragging = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }

    // --- 6. 生成列表 ---
    function generateNav() {
        // 每次检测更新时，都顺便检查一下主题（如果是 auto 模式）
        applyTheme();

        const queries = Array.from(document.querySelectorAll(currentStrategy.querySelector));
        const navItems = listElement.children;

        if (queries.length === 0) {
            if (navItems.length === 0) listElement.innerHTML = '<div style="padding:10px; opacity:0.6; font-size:12px;">等待对话...</div>';
            return;
        }

        if (navItems.length > 0 && !navItems[0].classList.contains('nav-item')) listElement.innerHTML = '';

        for (let i = 0; i < queries.length; i++) {
            const queryNode = queries[i];
            const fullText = currentStrategy.getText(queryNode);
            if (!fullText) continue;
            const shortText = `${i + 1}. ${fullText.substring(0, 15)}...`;

            if (i >= navItems.length) {
                const newItem = document.createElement('div');
                newItem.className = 'nav-item';
                newItem.textContent = shortText;
                newItem.title = fullText;
                newItem.onclick = () => scrollToNode(queryNode);
                listElement.appendChild(newItem);
            } else {
                const existingItem = navItems[i];
                if (existingItem.title !== fullText) {
                    existingItem.textContent = shortText;
                    existingItem.title = fullText;
                    existingItem.onclick = () => scrollToNode(queryNode);
                }
            }
        }
        while (navItems.length > queries.length) listElement.removeChild(listElement.lastChild);
    }

    function scrollToNode(node) {
        node.scrollIntoView({ behavior: 'smooth', block: 'center' });
        node.style.transition = 'opacity 0.5s';
        node.style.opacity = '0.5';
        setTimeout(() => { node.style.opacity = '1'; }, 300);
    }

    container.querySelector('#nav-refresh-btn').addEventListener('click', generateNav);
    container.querySelector('#nav-scroll-bottom').addEventListener('click', () => {
        listElement.scrollTo({ top: listElement.scrollHeight, behavior: 'smooth' });
    });

    const observer = new MutationObserver((mutations) => {
        if (window.navTimeout) clearTimeout(window.navTimeout);
        window.navTimeout = setTimeout(generateNav, 1500);
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });

    setTimeout(() => {
        generateNav();
        if (listElement.scrollHeight > 0) listElement.scrollTop = listElement.scrollHeight;
    }, 2000);
})();