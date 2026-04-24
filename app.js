import { auth, db, storage, googleProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, doc, setDoc, getDoc, updateDoc, ref, uploadBytes, getDownloadURL, sendPasswordResetEmail } from './firebase-config.js';

let currentUser = null;

document.addEventListener('DOMContentLoaded', () => {
    window.app = {}; // Export for HTML access
    const dashboard = document.getElementById('dashboard');
    const pathSelection = document.getElementById('path-selection');
    const roadmapContainer = document.getElementById('roadmap-container');
    const timelineContainer = document.getElementById('timeline-container');
    const backBtn = document.getElementById('back-to-dashboard');
    const jobGuideContent = document.getElementById('job-guide-content');
    const searchInput = document.getElementById('course-search');
    
    // Auth Elements
    const loginView = document.getElementById('login-view');
    const dashboardView = document.getElementById('dashboard-view');
    const mainNav = document.getElementById('main-nav');
    const homeView = document.getElementById('home-view');
    const getStartedBtn = document.getElementById('get-started');
    const loginForm = document.getElementById('login-form');
    const googleLogin = document.getElementById('google-login');
    const signOutBtn = document.getElementById('sign-out');
    const sidebarSignOutBtn = document.getElementById('sidebar-sign-out');
    const toggleRegister = document.getElementById('toggle-register');
    const navItems = document.querySelectorAll('.nav-item[data-view]');
    const viewSections = document.querySelectorAll('.view-section');
    
    // Feature Elements
    const quizList = document.getElementById('quiz-list');
    const roadmapEmptyState = document.getElementById('roadmap-empty-state');
    const roadmapActiveContent = document.getElementById('roadmap-active-content');
    
    const skillModal = document.getElementById('skill-modal');
    const closeModal = document.getElementById('close-modal');
    
    // Check if ROADMAP_DATA is available
    if (typeof ROADMAP_DATA === 'undefined') {
        console.error('Roadmap data not found!');
        return;
    }

    // --- State Management ---
    let currentPath = null;
    let userData = { 
        scores: {}, 
        completedSkills: [], 
        profile: {}, 
        videoProgress: {},
        timeSpent: 0, // In minutes
        problemsSolved: 0
    };
    
    // Timer for time spent tracking
    setInterval(() => {
        if (currentUser) {
            userData.timeSpent = (userData.timeSpent || 0) + 1;
            // Background sync every 5 mins or on view switch
            if (userData.timeSpent % 5 === 0) {
                updateDoc(doc(db, 'users', currentUser.uid), { timeSpent: userData.timeSpent });
            }
        }
    }, 60000);
    
    // Video Player State
    let ytPlayer = null;
    let currentVideoIndex = 0;
    let activePlaylist = [];
    let maxTimeWatched = 0;
    let antiSkipInterval = null;
    let isQuizActive = false;

    // --- Initialization ---
    function init() {
        setupEventListeners();
        checkAuth();
        setupTestModalListeners();
        setupProfileEditListeners();
        setupDiagnosticListeners();
        initVideoPlayerListeners();
        setupAntiCopyRestrictions();
    }

    function checkAuth() {
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                currentUser = user;
                try {
                    const snap = await getDoc(doc(db, 'users', user.uid));
                    if (snap.exists()) {
                        userData = snap.data();
                        if (!userData.scores) userData.scores = {};
                        if (!userData.completedSkills) userData.completedSkills = [];
                        if (!userData.profile) userData.profile = { name: user.displayName || 'User', email: user.email, goal: 'Not Set', photoURL: user.photoURL || '' };
                        if (!userData.videoProgress) userData.videoProgress = {};
                    } else {
                        userData = {
                            scores: {},
                            completedSkills: [],
                            profile: { name: user.displayName || 'User', email: user.email, goal: 'Not Set', photoURL: user.photoURL || '' },
                            videoProgress: {}
                        };
                        await setDoc(doc(db, 'users', user.uid), userData);
                    }
                    updateProfileUI();
                    showDashboard();
                } catch (e) {
                    console.error("Error fetching user data:", e);
                    showDashboard();
                }
            } else {
                currentUser = null;
                userData = { scores: {}, completedSkills: [], profile: {} };
                showHome();
            }
        });
    }

    function updateProfileUI() {
        if (!userData || !userData.profile) return;
        const { name, email, goal, photoURL } = userData.profile;
        const nameVal = name || 'User';
        
        // Update all name placeholders
        ['profile-name', 'ig-username-header', 'profile-name-val'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = nameVal;
        });

        const newTitle = document.getElementById('profile-title-val');
        if (newTitle) newTitle.textContent = goal || 'Career Goal Not Set';

        const newEmail = document.getElementById('profile-email-val');
        if (newEmail) newEmail.textContent = email || 'No Email Linked';
        
        // Avatar Logic - Fix for persistent display
        const avatarImg = document.getElementById('profile-avatar-img');
        const avatarInitials = document.getElementById('profile-avatar-initials');
        
        if (avatarImg && avatarInitials) {
            if (photoURL && photoURL.startsWith('http')) {
                avatarImg.src = photoURL;
                avatarImg.onload = () => {
                    avatarImg.style.display = 'block';
                    avatarInitials.style.display = 'none';
                };
                avatarImg.onerror = () => {
                    avatarImg.style.display = 'none';
                    avatarInitials.style.display = 'flex';
                };
            } else {
                avatarImg.style.display = 'none';
                avatarInitials.style.display = 'flex';
                avatarInitials.textContent = name ? name.charAt(0).toUpperCase() : 'U';
            }
        }
        
        // Populate Skill Tags
        const tagsContainer = document.getElementById('profile-skills-tags');
        if (tagsContainer) {
            const topSkills = userData.completedSkills?.slice(0, 3) || [];
            if (topSkills.length > 0) {
                tagsContainer.innerHTML = topSkills.map(s => `<span class="px-4 py-1.5 bg-[#e1e3de] text-[#5d605c] rounded-full text-sm font-medium">${s}</span>`).join('');
            } else {
                tagsContainer.innerHTML = `<span class="px-4 py-1.5 bg-[#e1e3de] text-[#5d605c] rounded-full text-sm font-medium">New Student</span>`;
            }
        }
    }

    function showHome() {
        loginView.classList.remove('active');
        dashboardView.style.display = 'none';
        mainNav.style.display = 'none';
        homeView.classList.add('active');
    }

    function showDashboard() {
        homeView.classList.remove('active');
        loginView.classList.remove('active');
        dashboardView.style.display = 'flex'; // Changed to flex for sidebar
        mainNav.style.display = 'flex';
        switchView('path-selection');
        updateProfileStats();
        renderPathSelection();
    }

    function switchView(viewId) {
        viewSections.forEach(section => {
            section.classList.toggle('active', section.id === viewId);
        });
        navItems.forEach(item => {
            item.classList.toggle('active', item.getAttribute('data-view') === viewId);
        });

        if (viewId === 'quiz-view') renderQuizzes();
        if (viewId === 'profile-view') updateProfileStats();
        
        // Roadmap logic: show empty state if no path selected
        if (viewId === 'roadmap-container') {
            const hasActive = !!currentPath;
            roadmapEmptyState.style.display = hasActive ? 'none' : 'flex';
            roadmapActiveContent.style.display = hasActive ? 'block' : 'none';
        }
    }

    function showLogin() {
        homeView.classList.remove('active');
        loginView.classList.add('active');
        dashboardView.style.display = 'none';
        mainNav.style.display = 'none';
    }

    // --- Render Functions ---

    // Course-to-category gradient + icon mapping
    const COURSE_STYLES = {
        'data-science':      { gradient: 'linear-gradient(135deg, #1e3a5f, #0ea5e9)', icon: 'database', tag: 'Tech · Data' },
        'ai':                { gradient: 'linear-gradient(135deg, #1a1a2e, #6c3483)', icon: 'cpu', tag: 'Tech · AI' },
        'ml':                { gradient: 'linear-gradient(135deg, #1b3a4b, #00b4d8)', icon: 'brain-circuit', tag: 'Tech · ML' },
        'full-stack':        { gradient: 'linear-gradient(135deg, #1a1a1a, #f7931e)', icon: 'layers', tag: 'Tech · Web' },
        'cloud':             { gradient: 'linear-gradient(135deg, #0a2342, #2196f3)', icon: 'cloud', tag: 'Tech · Cloud' },
        'cyber-security':    { gradient: 'linear-gradient(135deg, #1a0a0a, #e53935)', icon: 'shield-check', tag: 'Tech · Security' },
        'devops':            { gradient: 'linear-gradient(135deg, #0f2027, #203a43)', icon: 'infinity', tag: 'Tech · DevOps' },
        'blockchain':        { gradient: 'linear-gradient(135deg, #1a1200, #f9a825)', icon: 'link-2', tag: 'Tech · Web3' },
        'software-testing':  { gradient: 'linear-gradient(135deg, #0a2a0a, #2e7d32)', icon: 'badge-check', tag: 'Tech · QA' },
        'dsa':               { gradient: 'linear-gradient(135deg, #1a0a2e, #7c3aed)', icon: 'binary', tag: 'Tech · CS' },
        'python':            { gradient: 'linear-gradient(135deg, #1a3020, #4caf50)', icon: 'code-2', tag: 'Tech · Programming' },
        'ethical-hacking':   { gradient: 'linear-gradient(135deg, #0d0d0d, #43a047)', icon: 'terminal', tag: 'Tech · Security' },
        'iot':               { gradient: 'linear-gradient(135deg, #142030, #00acc1)', icon: 'radio', tag: 'Tech · IoT' },
        'mba':               { gradient: 'linear-gradient(135deg, #1a1200, #c0912a)', icon: 'briefcase', tag: 'Business · MBA' },
        'pgdm':              { gradient: 'linear-gradient(135deg, #200a0a, #c62828)', icon: 'graduation-cap', tag: 'Business · Mgmt' },
        'business-analytics':{ gradient: 'linear-gradient(135deg, #12171a, #0288d1)', icon: 'trending-up', tag: 'Business · Analytics' },
        'product-management':{ gradient: 'linear-gradient(135deg, #1a0a1a, #8e24aa)', icon: 'package', tag: 'Business · Product' },
        'digital-marketing': { gradient: 'linear-gradient(135deg, #1a0a0a, #e91e63)', icon: 'megaphone', tag: 'Business · Marketing' },
        'cfa':               { gradient: 'linear-gradient(135deg, #0a0a1a, #1565c0)', icon: 'landmark', tag: 'Finance · CFA' },
        'frm':               { gradient: 'linear-gradient(135deg, #1a0d0a, #bf360c)', icon: 'shield-alert', tag: 'Finance · FRM' },
        'financial-modeling':{ gradient: 'linear-gradient(135deg, #0a1a12, #2e7d32)', icon: 'calculator', tag: 'Finance · Modeling' },
        'investment-banking':{ gradient: 'linear-gradient(135deg, #1a1205, #ff8f00)', icon: 'building-2', tag: 'Finance · IB' },
        'ui-ux':             { gradient: 'linear-gradient(135deg, #1a0a1a, #e91e63)', icon: 'pen-tool', tag: 'Design · UI/UX' },
        'graphic-design':    { gradient: 'linear-gradient(135deg, #1a0820, #7b1fa2)', icon: 'palette', tag: 'Design · Graphic' },
        'animation-vfx':     { gradient: 'linear-gradient(135deg, #0a0a1a, #0d47a1)', icon: 'clapperboard', tag: 'Design · VFX' },
        'video-editing':     { gradient: 'linear-gradient(135deg, #0d0d0d, #c62828)', icon: 'video', tag: 'Design · Video' },
        'upsc':              { gradient: 'linear-gradient(135deg, #0a1a0a, #1b5e20)', icon: 'scroll-text', tag: 'Exam · UPSC' },
        'gate':              { gradient: 'linear-gradient(135deg, #0a0a1a, #283593)', icon: 'clipboard-check', tag: 'Exam · GATE' },
        'ssc':               { gradient: 'linear-gradient(135deg, #1a1200, #e65100)', icon: 'file-check', tag: 'Exam · SSC' },
        'banking-exams':     { gradient: 'linear-gradient(135deg, #0a1a1a, #006064)', icon: 'piggy-bank', tag: 'Exam · Banking' },
        'ms-abroad':         { gradient: 'linear-gradient(135deg, #0d1a0d, #1b5e20)', icon: 'globe', tag: 'Study Abroad · MS' },
        'mba-abroad':        { gradient: 'linear-gradient(135deg, #1a0a08, #bf360c)', icon: 'plane', tag: 'Study Abroad · MBA' },
        'm-tech':            { gradient: 'linear-gradient(135deg, #0a1a1a, #00897b)', icon: 'flask-conical', tag: 'Engineering · M.Tech' },
        'robotics':          { gradient: 'linear-gradient(135deg, #0d1117, #388e3c)', icon: 'bot', tag: 'Engineering · Robotics' },
        'embedded-systems':  { gradient: 'linear-gradient(135deg, #1a1200, #ef6c00)', icon: 'circuit-board', tag: 'Engineering · Embedded' },
        'vlsi':              { gradient: 'linear-gradient(135deg, #1a0a2e, #5e35b1)', icon: 'cpu', tag: 'Engineering · VLSI' },
        'automation':        { gradient: 'linear-gradient(135deg, #1a1a0a, #afb42b)', icon: 'settings-2', tag: 'Engineering · Auto' },
        'renewable-energy':  { gradient: 'linear-gradient(135deg, #0a1a0a, #d84315)', icon: 'sun', tag: 'Engineering · Energy' },
    };

    function renderPathSelection(filter = '') {
        dashboard.innerHTML = '';
        const keys = Object.keys(ROADMAP_DATA).filter(key => {
            const path = ROADMAP_DATA[key];
            const searchStr = `${path.title} ${path.description} ${key}`.toLowerCase();
            return searchStr.includes(filter.toLowerCase());
        });

        if (keys.length === 0) {
            dashboard.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 50px; color: var(--text-secondary);">
                    <i data-lucide="search-x" style="width: 48px; height: 48px; margin-bottom: 15px; opacity: 0.5;"></i>
                    <p>No career paths found matching your search.</p>
                </div>
            `;
            lucide.createIcons();
            return;
        }

        keys.forEach(key => {
            const path = ROADMAP_DATA[key];
            const style = COURSE_STYLES[key] || { gradient: 'linear-gradient(135deg, #1a1a2e, #6c3483)', icon: 'star', tag: 'Career Path' };
            const card = document.createElement('div');
            card.className = 'path-card';
            card.innerHTML = `
                <div class="card-banner" style="background: ${style.gradient};">
                    <i data-lucide="${style.icon}" class="card-banner-icon"></i>
                    <span class="card-tag">${style.tag}</span>
                </div>
                <div class="card-body">
                    <h3>${path.title}</h3>
                    <p>${path.description}</p>
                </div>
            `;
            card.onclick = () => handlePathSelection(key);
            dashboard.appendChild(card);
        });
        lucide.createIcons();
    }

    // =============================================
    // CODING CONTESTS DATA & RENDERER
    // =============================================
    const UPCOMING_CONTESTS = [
        { id: 'lc-450', platform: 'LeetCode', title: 'Weekly Contest 450', date: 'Sunday, 8:00 AM PST', requiredFor: ['dsa', 'python', 'full-stack', 'java', 'robotics'], icon: 'code' },
        { id: 'cc-130', platform: 'CodeChef', title: 'Starters 130 (Rated)', date: 'Wednesday, 8:00 PM IST', requiredFor: ['dsa', 'python', 'full-stack', 'java'], icon: 'terminal' },
        { id: 'lc-bi-100', platform: 'LeetCode', title: 'Biweekly Contest 100', date: 'Saturday, 7:30 AM PST', requiredFor: ['dsa', 'python'], icon: 'binary' }
    ];

    function renderQuizzes() {
        const quizList = document.getElementById('quiz-list');
        if (!quizList) return;
        
        quizList.innerHTML = `
            <div style="grid-column: 1/-1; margin-bottom: 20px;">
                <h3 style="font-size: 1.5rem; margin-bottom: 10px;">Upcoming Coding Contests</h3>
                <p style="color: var(--text-secondary);">Participate in these contests to automatically update your skill rating and adjust your dynamic schedule.</p>
            </div>
        `;

        UPCOMING_CONTESTS.forEach(contest => {
            // Check if user already attended
            const score = userData.platformScores && userData.platformScores[contest.platform] ? userData.platformScores[contest.platform].score : null;
            const attended = score !== null;

            const card = document.createElement('div');
            card.className = 'quiz-card';
            card.style.background = 'white';
            card.style.border = '1px solid var(--border-color)';
            card.style.borderRadius = '20px';
            card.style.padding = '20px';

            card.innerHTML = `
                <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 15px;">
                    <div style="width: 50px; height: 50px; border-radius: 12px; background: var(--bg-hover); display: flex; align-items: center; justify-content: center; color: var(--primary);">
                        <i data-lucide="${contest.icon}"></i>
                    </div>
                    <div>
                        <h4 style="margin: 0; font-size: 1.1rem; color: var(--text-primary);">${contest.title}</h4>
                        <span style="font-size: 0.8rem; color: var(--text-secondary); background: var(--bg-hover); padding: 2px 8px; border-radius: 10px;">${contest.platform}</span>
                    </div>
                </div>
                <div style="margin-bottom: 20px; font-size: 0.9rem; color: var(--text-secondary);">
                    <p><i data-lucide="calendar" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle;"></i> ${contest.date}</p>
                </div>
                ${attended ? 
                    `<div style="background: rgba(34,197,94,0.1); color: var(--success); padding: 10px; border-radius: 10px; text-align: center; font-weight: bold; margin-bottom: 15px;">
                        Status: Attended (Score: ${score})
                    </div>` : 
                    `<button class="btn-primary" style="width: 100%; margin-bottom: 10px;" onclick="simulateContest('${contest.id}', '${contest.platform}')">
                        Simulate Attend Contest
                    </button>
                    <button class="btn-primary" style="width: 100%; background: var(--bg-hover); color: var(--text-primary);" onclick="window.open('https://google.com/search?q=${contest.platform}+${contest.title}', '_blank')">
                        Go to Platform <i data-lucide="external-link" style="width: 14px; height: 14px;"></i>
                    </button>`
                }
            `;
            quizList.appendChild(card);
        });
        lucide.createIcons();
    }

    window.simulateContest = async (contestId, platform) => {
        const scoreStr = prompt(`Enter your simulated score/rating for ${platform} (e.g. 1000 - 2500):`, "1400");
        if (!scoreStr) return;
        
        const score = parseInt(scoreStr, 10);
        if (isNaN(score)) return alert("Invalid score entered.");

        if (!userData.platformScores) userData.platformScores = {};
        userData.platformScores[platform] = { score, lastAttended: new Date().toISOString(), contestId };

        if (currentUser) {
            await setDoc(doc(db, 'users', currentUser.uid), { platformScores: userData.platformScores }, { merge: true });
        }
        
        alert(`Score saved! Your ${platform} rating is now ${score}. Your learning schedule will adapt accordingly.`);
        renderQuizzes(); // Re-render to show attended status
    };

    // =============================================
    // QUIZ QUESTIONS BANK (per-course, per-module)
    // =============================================
    const QUIZ_BANK = {
        'data-science': [
            [
                { q: "Which Python library is primarily used for data manipulation?", opts: ["NumPy", "Pandas", "Matplotlib", "Scikit-Learn"], ans: 1 },
                { q: "What does 'NaN' stand for in Pandas?", opts: ["Null and Nil", "Not a Number", "Nested Array Node", "None"], ans: 1 },
                { q: "Which of the following is a measure of central tendency?", opts: ["Variance", "Standard Deviation", "Mean", "Range"], ans: 2 },
                { q: "What is the output of arr.shape for a 3x4 numpy array?", opts: ["(12,)", "(3,4)", "(4,3)", "(3,)"], ans: 1 },
                { q: "Which function is used to read a CSV file in Pandas?", opts: ["pd.open()", "pd.load_csv()", "pd.read_csv()", "pd.import_csv()"], ans: 2 }
            ],[
                { q: "What does EDA stand for?", opts: ["Extreme Data Analysis", "Exploratory Data Analysis", "Empirical Data Algorithm", "Extended Data Aggregation"], ans: 1 },
                { q: "Which visualization library is built on top of Matplotlib?", opts: ["Plotly", "Bokeh", "Seaborn", "Altair"], ans: 2 },
                { q: "What is a DataFrame in Pandas?", opts: ["A single array", "A 2D labeled data structure", "A Python list", "A database schema"], ans: 1 },
                { q: "Which SQL command retrieves data from a table?", opts: ["INSERT", "DELETE", "SELECT", "UPDATE"], ans: 2 },
                { q: "What is data normalization?", opts: ["Deleting outliers", "Scaling features to a common range", "Adding missing values", "Sorting data"], ans: 1 }
            ],[
                { q: "What does overfitting mean in ML?", opts: ["Model performs well on new data", "Model memorizes training data but fails on new data", "Model has too few parameters", "Model is underfit"], ans: 1 },
                { q: "What is a hyperparameter?", opts: ["A parameter learned during training", "A configuration set before training", "A type of neural layer", "An output variable"], ans: 1 },
                { q: "Which technique reduces dimensionality?", opts: ["KNN", "PCA", "SVM", "GBM"], ans: 1 },
                { q: "What is Apache Spark primarily used for?", opts: ["Web development", "Mobile apps", "Large-scale data processing", "Image recognition"], ans: 2 },
                { q: "What is cross-validation used for?", opts: ["Data visualization", "Assessing model generalization", "Feature engineering", "Data cleaning"], ans: 1 }
            ]
        ],
        'dsa': [
            [
                { q: "What is the time complexity of binary search?", opts: ["O(n)", "O(n²)", "O(log n)", "O(1)"], ans: 2 },
                { q: "Which data structure uses LIFO?", opts: ["Queue", "Stack", "Heap", "Graph"], ans: 1 },
                { q: "What is an array index starting at?", opts: ["1", "0", "-1", "Depends on language"], ans: 1 },
                { q: "Which sorting algorithm has best average complexity?", opts: ["Bubble Sort", "Merge Sort", "Insertion Sort", "Selection Sort"], ans: 1 },
                { q: "What is a linked list node composed of?", opts: ["Only data", "Data and a pointer", "An index and value", "Key-value pair"], ans: 1 }
            ],[
                { q: "What is BFS used for in graphs?", opts: ["Shortest path in weighted graphs", "Shortest path in unweighted graphs", "Finding cycles", "Topological sort"], ans: 1 },
                { q: "Which data structure is a heap?", opts: ["A complete binary tree satisfying heap property", "A sorted array", "A hash table", "A doubly linked list"], ans: 0 },
                { q: "What does a hash function do?", opts: ["Sorts data", "Maps data to a fixed-size value", "Compresses data", "Encrypts data"], ans: 1 },
                { q: "What is the worst-case of Quicksort?", opts: ["O(n log n)", "O(n)", "O(n²)", "O(log n)"], ans: 2 },
                { q: "DFS uses which data structure?", opts: ["Queue", "Stack", "Array", "Heap"], ans: 1 }
            ],[
                { q: "What is memoization?", opts: ["Storing results of expensive calls to reuse", "Allocating memory", "Clearing cache", "Recursion technique"], ans: 0 },
                { q: "What is the 0/1 Knapsack problem solved with?", opts: ["Greedy", "Dynamic Programming", "BFS", "Binary Search"], ans: 1 },
                { q: "What is backtracking?", opts: ["A loop reset technique", "Trying all solutions and abandoning invalid ones", "Reversing a list", "A graph algorithm"], ans: 1 },
                { q: "Which problem uses Dijkstra's algorithm?", opts: ["Shortest path in weighted graph", "Cycle detection", "Topological sort", "Minimum spanning tree"], ans: 0 },
                { q: "What is the time complexity of merge sort?", opts: ["O(n²)", "O(n log n)", "O(log n)", "O(n)"], ans: 1 }
            ]
        ],
        'full-stack': [
            [
                { q: "What does HTML stand for?", opts: ["Hyper Text Markup Language", "High Text Machine Language", "Hyper Transfer Markup Loader", "Home Tool Markup Language"], ans: 0 },
                { q: "Which CSS property controls text size?", opts: ["text-size", "font-size", "text-scale", "letter-size"], ans: 1 },
                { q: "What does 'DOM' stand for?", opts: ["Document Object Model", "Data Object Module", "Display Output Method", "Document Order Manager"], ans: 0 },
                { q: "Which JS method selects an element by ID?", opts: ["querySelector", "getElementById", "getElementByClass", "findElement"], ans: 1 },
                { q: "What is CSS Flexbox used for?", opts: ["Animations", "Responsive layout design", "Font management", "Color schemes"], ans: 1 }
            ],[
                { q: "React is primarily a UI ___?", opts: ["Framework", "Library", "Database", "Server"], ans: 1 },
                { q: "What is Node.js?", opts: ["A browser", "A JavaScript runtime on the server", "A CSS framework", "A database"], ans: 1 },
                { q: "What does REST stand for?", opts: ["Rapid Endpoint Syntax Transfer", "Representational State Transfer", "Remote Execution State Terminal", "Resource Entity Service Transfer"], ans: 1 },
                { q: "Which Node.js framework is commonly used?", opts: ["Django", "Laravel", "Express", "Spring"], ans: 2 },
                { q: "What is npm?", opts: ["Node Procedure Manager", "Node Package Manager", "Net Protocol Module", "No-Platform Module"], ans: 1 }
            ],[
                { q: "What is SQL used for?", opts: ["Styling web pages", "Querying relational databases", "Writing server code", "Managing containers"], ans: 1 },
                { q: "What is Docker?", opts: ["A programming language", "A containerization platform", "A cloud provider", "A CSS tool"], ans: 1 },
                { q: "What is a primary key in a database?", opts: ["First column", "Unique identifier for each row", "Encrypted password", "Foreign reference"], ans: 1 },
                { q: "What does CI/CD stand for?", opts: ["Continuous Integration/Continuous Delivery", "Code Integration/Code Deployment", "Certified Interface/Certified Design", "Client Interface/Client Delivery"], ans: 0 },
                { q: "What is JWT used for?", opts: ["Styling", "Authentication & authorization tokens", "Database indexing", "CSS animations"], ans: 1 }
            ]
        ]
    };

    // Extend QUIZ_BANK with all additional courses
    Object.assign(QUIZ_BANK, {
        'ai': [
            [
                { q: "The primary goal of AI is?", opts: ["Speed up CPUs", "Simulate human-like intelligence", "Compress files", "Store data cheaply"], ans: 1 },
                { q: "BFS explores graph nodes?", opts: ["Deepest nodes first", "Level by level (nearest first)", "Randomly", "Alphabetically"], ans: 1 },
                { q: "A* search algorithm uses?", opts: ["Random sampling", "A heuristic to guide search toward goal", "Pure gradient descent", "Brute force enumeration"], ans: 1 },
                { q: "Linear algebra is important in AI for?", opts: ["Database schema design", "Representing data as tensors/matrices", "Network routing tables", "OS kernel design"], ans: 1 },
                { q: "Which is NOT an AI subfield?", opts: ["Machine Learning", "Natural Language Processing", "Accounting Software", "Computer Vision"], ans: 2 }
            ],[
                { q: "Neural networks are inspired by?", opts: ["Computer circuits", "The human brain's neurons", "Database join tables", "File systems"], ans: 1 },
                { q: "Backpropagation is used to?", opts: ["Pass data forward", "Update weights via error gradient", "Generate outputs", "Preprocess raw data"], ans: 1 },
                { q: "CNNs are best suited for?", opts: ["Sequential text data", "Image recognition tasks", "Time-series forecasting", "Tabular structured data"], ans: 1 },
                { q: "RNNs are best suited for?", opts: ["Static image classification", "Sequential/time-series data", "Unsupervised clustering", "Dimensionality reduction"], ans: 1 },
                { q: "Transfer learning means?", opts: ["Moving files between servers", "Reusing a pre-trained model on a new task", "Always training from scratch", "Transferring GPU to CPU workloads"], ans: 1 }
            ],[
                { q: "Transformer architecture relies on?", opts: ["Convolution layers only", "Attention mechanisms", "Recurrent connections", "Decision tree ensembles"], ans: 1 },
                { q: "GPT stands for?", opts: ["General Processing Tool", "Generative Pre-trained Transformer", "Graph Processing Technique", "Graded Prediction Tree"], ans: 1 },
                { q: "Fine-tuning an LLM means?", opts: ["Always training from scratch", "Adapting a pre-trained model to a specific task", "Deleting model weights", "Only scaling model size"], ans: 1 },
                { q: "Prompt engineering involves?", opts: ["Writing hardware firmware", "Crafting inputs to guide LLM outputs effectively", "Designing semiconductor chips", "Curating giant training datasets"], ans: 1 },
                { q: "Responsible AI requires?", opts: ["Maximizing profit at all costs", "Fairness, transparency, and accountability", "Ignoring detected bias", "Using only open-source models"], ans: 1 }
            ]
        ],
        'ml': [
            [
                { q: "Supervised learning requires?", opts: ["Only unlabeled data", "Labeled input-output pairs", "Pure reinforcement signals", "Random sampling"], ans: 1 },
                { q: "Linear regression predicts?", opts: ["Categorical class labels", "Continuous numeric values", "Data clusters", "Discrete probabilities only"], ans: 1 },
                { q: "Training data is used to?", opts: ["Evaluate the final model", "Fit/learn the model parameters", "Store data in cloud", "Visualize outputs"], ans: 1 },
                { q: "Logistic regression is used for?", opts: ["Only regression tasks", "Binary classification", "Clustering tasks", "Dimensionality reduction"], ans: 1 },
                { q: "Overfitting occurs when?", opts: ["Model is too simple", "Model memorizes training data but fails on new data", "Model has zero parameters", "Model trains on no data"], ans: 1 }
            ],[
                { q: "XGBoost uses?", opts: ["Simple decision trees only", "Gradient Boosting", "K-Nearest Neighbors", "Plain Linear Regression"], ans: 1 },
                { q: "Random Forest improves over a single Decision Tree by?", opts: ["Using only one tree", "Averaging many trees to reduce variance", "Removing most features", "Using only linear models"], ans: 1 },
                { q: "Feature engineering involves?", opts: ["Automating entire ML pipelines", "Creating useful features from raw data to improve model performance", "Selecting the model architecture", "Deploying a model to production"], ans: 1 },
                { q: "K-Fold cross-validation splits data into?", opts: ["2 equal halves always", "K equal subsets for iterative validation", "Training data only", "K independent models"], ans: 1 },
                { q: "Imbalanced dataset means?", opts: ["All classes are equal in size", "One class dominates/outnumbers others significantly", "Dataset has no missing values", "Dataset is fully clean"], ans: 1 }
            ],[
                { q: "MLOps stands for?", opts: ["Machine Learning Operations", "Multi-Layer Optimization System", "Model Load Operations", "Modular Logic Operations"], ans: 0 },
                { q: "Docker helps ML deployment by?", opts: ["Training models faster on GPU", "Packaging models with all dependencies for consistent deployment", "Auto-tuning hyperparameters", "Automatically cleaning data"], ans: 1 },
                { q: "Model drift means?", opts: ["Model continuously improving by itself", "Model performance degrading due to changing real-world data", "Model retraining automatically", "Model migrating to a new cloud region"], ans: 1 },
                { q: "FastAPI is used in ML for?", opts: ["Training neural networks", "Serving model predictions as REST APIs", "Data preprocessing pipelines", "Feature selection"], ans: 1 },
                { q: "MLflow is used for?", opts: ["Building neural networks from scratch", "Tracking ML experiments and managing models", "Deploying web applications", "Encrypting model weight files"], ans: 1 }
            ]
        ],
        'cloud': [
            [
                { q: "Cloud computing delivers IT services via?", opts: ["Only local hardware", "The internet on-demand", "USB drives", "Physical store media"], ans: 1 },
                { q: "IaaS stands for?", opts: ["Internet as a Service", "Infrastructure as a Service", "Integration as a Service", "Intelligence as a Service"], ans: 1 },
                { q: "AWS IAM manages?", opts: ["Storing objects in buckets", "Users, access, and permissions", "Running containers at scale", "Caching application data"], ans: 1 },
                { q: "VPC in AWS stands for?", opts: ["Virtual Private Cloud", "Virtual Proxy Connection", "Variable Public Container", "Verified Protocol Cluster"], ans: 0 },
                { q: "AWS global locations are organized into?", opts: ["Data zones only", "Regions and Availability Zones", "Cloud server farms", "Edge nodes only"], ans: 1 }
            ],[
                { q: "EC2 in AWS provides?", opts: ["Object storage", "Virtual compute (server) instances", "DNS resolution services", "Email delivery services"], ans: 1 },
                { q: "AWS S3 stores data as?", opts: ["Relational database tables", "Objects inside named buckets", "Traditional file directories", "In-memory cached blocks"], ans: 1 },
                { q: "AWS Lambda enables?", opts: ["Relational database management", "Running code without managing servers (serverless)", "CDN distribution only", "Log monitoring and alerting"], ans: 1 },
                { q: "Auto Scaling in AWS automatically?", opts: ["Provisions servers manually", "Adjusts compute capacity based on load", "Backs up data to S3", "Calculates monthly billing only"], ans: 1 },
                { q: "AWS CloudFront is a?", opts: ["Relational database", "Content Delivery Network (CDN)", "Kubernetes cluster manager", "Identity and access provider"], ans: 1 }
            ],[
                { q: "Terraform is used for?", opts: ["Unit testing code quality", "Infrastructure as Code (IaC) provisioning", "Training ML models", "Monitoring application metrics"], ans: 1 },
                { q: "'terraform apply' does?", opts: ["Only shows the execution plan", "Creates or updates real infrastructure", "Only validates syntax", "Rolls back previous changes"], ans: 1 },
                { q: "Security Groups in AWS are?", opts: ["Stateless packet filters", "Stateful virtual firewall rules for EC2", "IAM permission boundaries", "VPC route table entries"], ans: 1 },
                { q: "AWS Shared Responsibility Model means?", opts: ["AWS handles all security", "Customer and AWS share security responsibilities", "Customer is solely responsible", "Auditors are the only responsible party"], ans: 1 },
                { q: "CloudWatch is used for?", opts: ["S3 storage lifecycle", "Monitoring metrics, logs, and triggering alarms", "DNS domain resolution", "EC2 instance provisioning only"], ans: 1 }
            ]
        ],
        'cyber-security': [
            [
                { q: "Phishing attacks are?", opts: ["Network scanning techniques", "Deceptive messages tricking users into revealing sensitive data", "Hardware exploit methods", "Port forwarding attacks"], ans: 1 },
                { q: "A firewall's role is to?", opts: ["Encrypt all data at rest", "Filter incoming and outgoing network traffic", "Detect viruses in all files", "Assign dynamic IP addresses"], ans: 1 },
                { q: "TCP/IP provides?", opts: ["Storage protocols for data at rest", "Rules for network communication", "File encryption algorithms", "User authentication methods"], ans: 1 },
                { q: "A VPN does what?", opts: ["Provides antivirus protection", "Creates an encrypted tunnel over the internet", "Scans for open ports on networks", "Manages web server traffic routing"], ans: 1 },
                { q: "IP addressing is handled at which OSI layer?", opts: ["Transport layer", "Network layer", "Application layer", "Data Link layer"], ans: 1 }
            ],[
                { q: "Nmap is used for?", opts: ["Encrypting network traffic", "Network scanning and host/port discovery", "Firewall rule management", "Server performance monitoring"], ans: 1 },
                { q: "Metasploit Framework is?", opts: ["A network monitoring dashboard", "A penetration testing and exploit framework", "A cloud security service", "An enterprise antivirus engine"], ans: 1 },
                { q: "SQL Injection attacks target?", opts: ["The OSI network layer", "Databases through malformed user input", "The OS kernel directly", "GPU video memory"], ans: 1 },
                { q: "XSS (Cross-Site Scripting) attacks?", opts: ["Inject SQL queries into databases", "Inject malicious scripts into web pages viewed by users", "Exploit OS kernel vulnerabilities", "Brute-force encrypted passwords"], ans: 1 },
                { q: "Kali Linux is?", opts: ["A gaming operating system", "A security-focused Linux distribution for penetration testing", "A production database server OS", "A Windows alternative OS"], ans: 1 }
            ],[
                { q: "SIEM stands for?", opts: ["Security Information and Event Management", "Simple Intrusion Event Monitor", "Secure Internet Email Module", "System Integrity Error Module"], ans: 0 },
                { q: "First step in incident response is?", opts: ["Immediate eradication", "Identification and detection of the incident", "Full system recovery", "Immediate containment"], ans: 1 },
                { q: "Zero Trust security assumes?", opts: ["All internal users are fully trusted", "No user or device is trusted by default — always verify", "Cloud services are already fully secure", "Passwords alone are sufficient"], ans: 1 },
                { q: "Digital forensics involves?", opts: ["Designing secure network topologies", "Recovering and analyzing digital evidence after incidents", "Writing new firewall security rules", "Social media profile monitoring"], ans: 1 },
                { q: "CEH stands for?", opts: ["Certified Ethical Hacker", "Core Enterprise Hacking", "Cyber Engineering Hierarchy", "Certified Expert Hacker"], ans: 0 }
            ]
        ],
        'devops': [
            [
                { q: "DevOps combines?", opts: ["Development and Operations teams", "Design and Operations teams", "Data Science and Operations", "Deployment scripts and Objects"], ans: 0 },
                { q: "Shell scripting is key in DevOps for?", opts: ["UI and frontend design", "Automating repetitive system and deployment tasks", "Database schema design", "Mobile app development"], ans: 1 },
                { q: "Git is a?", opts: ["Centralized relational database", "Distributed version control system", "Build automation framework", "Cloud infrastructure provider"], ans: 1 },
                { q: "SSH is used for?", opts: ["Encrypted file storage only", "Secure remote access to servers", "Container image building", "Running CD pipelines"], ans: 1 },
                { q: "A pull request in Git is?", opts: ["Downloading code from a remote repo", "Proposing code changes for review and merging", "Permanently deleting a feature branch", "Rolling back the last commit"], ans: 1 }
            ],[
                { q: "CI/CD stands for?", opts: ["Continuous Integration/Continuous Delivery", "Core Interface/Code Delivery", "Cloud Infra/Code Deploy", "Client Integration/Code Dispatch"], ans: 0 },
                { q: "GitHub Actions automates?", opts: ["Code storage and backup only", "Workflows like build, test, deploy triggered by code events", "Manual code review assignments", "Project milestone tracking only"], ans: 1 },
                { q: "A Docker container is?", opts: ["A full virtual machine", "A lightweight, isolated process with its own filesystem", "A dedicated build server", "A single source code repository"], ans: 1 },
                { q: "Docker Compose is used to?", opts: ["Orchestrate large Kubernetes clusters", "Define and run multi-container Docker apps locally", "Build single Docker images faster", "Monitor live container health metrics"], ans: 1 },
                { q: "A CI/CD artifact is?", opts: ["A raw source code file", "A pipeline build output (e.g. JAR, Docker image) to be deployed", "A monitoring alert notification", "A project team member"], ans: 1 }
            ],[
                { q: "Kubernetes is used for?", opts: ["Source code version management", "Container orchestration and management at scale", "Log file aggregation only", "Network security policy enforcement"], ans: 1 },
                { q: "The smallest deployable unit in Kubernetes is?", opts: ["A cluster", "A Pod (one or more containers sharing network/storage)", "A service endpoint", "A persistent volume"], ans: 1 },
                { q: "Helm in Kubernetes is a?", opts: ["Alternative container runtime", "Package manager for Kubernetes apps (charts)", "Network traffic monitoring tool", "Security vulnerability scanner"], ans: 1 },
                { q: "Prometheus is primarily used for?", opts: ["Building Docker container images", "Collecting and storing time-series metrics with alerting", "Running CI/CD pipelines", "Conducting automated code reviews"], ans: 1 },
                { q: "SRE (Site Reliability Engineering) focuses on?", opts: ["Only developing new product features", "Reliability, performance, and scalability of production systems", "UI/UX design and prototyping", "Database administration only"], ans: 1 }
            ]
        ],
        'blockchain': [
            [
                { q: "Blockchain is best described as?", opts: ["A centralized database system", "A distributed, immutable ledger", "A cloud storage service", "A scripting language"], ans: 1 },
                { q: "Proof of Work is a?", opts: ["SHA-256 hashing algorithm", "Consensus mechanism for block validation", "Smart contract token standard", "Wallet authentication protocol"], ans: 1 },
                { q: "A public key in blockchain is?", opts: ["A private wallet password", "Shareable address to receive cryptocurrency", "The unique blockchain network ID", "A block mining reward value"], ans: 1 },
                { q: "SHA-256 in Bitcoin is used for?", opts: ["Compressing transaction data", "Cryptographic hashing of block data", "Routing payment transactions", "Validating block size only"], ans: 1 },
                { q: "Ethereum adds to Bitcoin by supporting?", opts: ["Only peer-to-peer payments", "Smart contracts and decentralized applications", "Only Proof-of-Work mining", "A centralized ledger model"], ans: 1 }
            ],[
                { q: "Solidity is used to?", opts: ["Write Python automation scripts", "Write smart contracts on the Ethereum blockchain", "Build web frontend UIs", "Mine Ethereum cryptocurrency"], ans: 1 },
                { q: "ERC-20 is a standard for?", opts: ["Hardware cold wallets", "Fungible tokens on Ethereum network", "Non-fungible tokens (NFTs) only", "A blockchain consensus mechanism"], ans: 1 },
                { q: "Hardhat is a?", opts: ["Blockchain transaction explorer", "Ethereum development and testing environment", "Cryptocurrency exchange platform", "DeFi yield farming protocol"], ans: 1 },
                { q: "Gas fees on Ethereum are?", opts: ["Physical energy consumption costs", "Payment for computational work done on the network", "Token price fluctuation measures", "Mining hardware difficulty ratings"], ans: 1 },
                { q: "OpenZeppelin provides?", opts: ["Blockchain hardware wallet devices", "Audited, reusable smart contract security libraries", "Live crypto price feed data", "Frontend wallet interface templates"], ans: 1 }
            ],[
                { q: "Web3.js is used to?", opts: ["Build Express.js web servers", "Interact with the Ethereum blockchain from JavaScript", "Automatically mine cryptocurrency", "Create offline cold storage wallets"], ans: 1 },
                { q: "MetaMask is?", opts: ["Ethereum mining software", "A browser extension wallet for Ethereum DApps", "A smart contract programming language", "A full Ethereum network node"], ans: 1 },
                { q: "DeFi stands for?", opts: ["Decentralized Finance", "Digital Financial Interface", "Distributed File Index", "Defined Fixed Income instrument"], ans: 0 },
                { q: "IPFS in Web3 is for?", opts: ["On-chain smart contract execution", "Decentralized peer-to-peer file storage", "Block consensus voting", "Token minting and issuance"], ans: 1 },
                { q: "Layer-2 solutions aim to?", opts: ["Completely replace Layer-1 blockchains", "Improve scalability while inheriting L1 security", "Issue only new types of tokens", "Increase base transaction gas costs"], ans: 1 }
            ]
        ],
        'ui-ux': [
            [
                { q: "CRAP design principles stand for?", opts: ["Color, Ratio, Art, Position", "Contrast, Repetition, Alignment, Proximity", "Clear, Readable, Artistic, Plain", "Centered, Rounded, Aesthetic, Plain"], ans: 1 },
                { q: "Visual hierarchy means?", opts: ["Placing elements randomly", "Guiding the eye using visual weight, size, and contrast", "Adding many colors everywhere", "Reducing image file sizes"], ans: 1 },
                { q: "Accessibility in design means?", opts: ["Making designs very colorful", "Ensuring designs work for users with disabilities (WCAG)", "Reducing all assets to small file sizes", "Adding many micro-animations"], ans: 1 },
                { q: "A wireframe is?", opts: ["The final high-fidelity colored mockup", "A low-fidelity structural layout without styling", "A fully coded interactive prototype", "A brand color guide document"], ans: 1 },
                { q: "Kerning in typography specifically adjusts?", opts: ["The space between lines (leading)", "Space between individual character pairs", "The overall font weight/boldness", "Capitalization of letters"], ans: 1 }
            ],[
                { q: "Figma is primarily a?", opts: ["Backend code editor", "Collaborative design and prototyping tool", "Database management system", "Video production editor"], ans: 1 },
                { q: "Auto Layout in Figma enables?", opts: ["Automated color management", "Flexible, responsive component design", "Custom icon exporting", "Batch export settings"], ans: 1 },
                { q: "A design system includes?", opts: ["Only icon assets", "Reusable components, design tokens, and usage guidelines", "Marketing campaigns and copy", "Backend API reference documentation"], ans: 1 },
                { q: "A Figma component is?", opts: ["A full page layout section", "A reusable UI element with overrideable instances", "A raw imported image file", "A font typeface file"], ans: 1 },
                { q: "Interaction design focuses on?", opts: ["Color palette selection only", "Defining how users interact with a product", "Typography hierarchy only", "Writing and compiling code"], ans: 1 }
            ],[
                { q: "Usability testing involves?", opts: ["Only developer peer code review", "Real users attempting tasks on the actual product", "Automated regression test scripts only", "Designer preference voting sessions"], ans: 1 },
                { q: "Heuristic evaluation checks?", opts: ["User emotional responses to color", "Adherence to established usability principles (Nielsen's 10)", "Current SEO keyword ranking", "Print color accuracy"], ans: 1 },
                { q: "Card sorting determines?", opts: ["User color scheme preferences", "Optimal information architecture and navigation structure", "Preferred font sizes for legibility", "Ideal animation timing"], ans: 1 },
                { q: "A/B testing in UX compares?", opts: ["Two audiences seeing identical designs", "Two design variations to find which performs better", "Two competing brands", "Old brand vs new rebranding"], ans: 1 },
                { q: "The ultimate goal of UX design is?", opts: ["Making interfaces visually beautiful only", "Creating meaningful, efficient, and usable experiences for users", "Building RESTful backend APIs", "Writing all marketing copy"], ans: 1 }
            ]
        ],
        'upsc': [
            [
                { q: "UPSC CSE recruits for?", opts: ["State civil services only", "Central civil services (IAS, IPS, IFS, etc.)", "Military officer positions", "Banking sector roles"], ans: 1 },
                { q: "UPSC Prelims has how many papers?", opts: ["1", "2", "3", "4"], ans: 1 },
                { q: "Article 14 of Indian Constitution guarantees?", opts: ["Freedom of speech", "Equality before the law", "Free compulsory education", "Right to life"], ans: 1 },
                { q: "Indian National Congress was founded in?", opts: ["1857", "1885", "1905", "1916"], ans: 1 },
                { q: "Tropic of Cancer passes through how many Indian states?", opts: ["6", "8", "7", "9"], ans: 1 }
            ],[
                { q: "UPSC Mains GS papers total?", opts: ["2", "4", "6", "8"], ans: 1 },
                { q: "GS Paper 4 in Mains covers?", opts: ["Ancient History", "Ethics, Integrity & Aptitude", "Indian Economy", "Science & Tech"], ans: 1 },
                { q: "Parliament consists of?", opts: ["Lok Sabha only", "Rajya Sabha only", "President + Lok Sabha + Rajya Sabha", "Supreme Court + Parliament"], ans: 2 },
                { q: "NITI Aayog replaced Planning Commission in?", opts: ["2013", "2014", "2015", "2016"], ans: 2 },
                { q: "Which is a Directive Principle (DPSP)?", opts: ["Right to vote", "Equal pay for equal work", "Freedom of speech", "Right to free education"], ans: 1 }
            ],[
                { q: "The UPSC interview is also called?", opts: ["Viva Voce / Personality Test", "Written Test Round 3", "Group Discussion round", "Aptitude Assessment"], ans: 0 },
                { q: "DAF in UPSC stands for?", opts: ["Detailed Application Form", "Data Analysis Format", "Document Acceptance Form", "Draft Assessment File"], ans: 0 },
                { q: "Maximum UPSC CSE attempts for General category?", opts: ["3", "4", "6", "Unlimited"], ans: 2 },
                { q: "IFS (via UPSC CSE) refers to?", opts: ["Indian Finance Service", "Indian Foreign Service", "Indian Forest Service", "Indian Federal Service"], ans: 1 },
                { q: "UPSC notification is published in?", opts: ["Times of India", "Gazette of India / UPSC website", "Ministry of Education portal", "PMO website"], ans: 1 }
            ]
        ],
        'gate': [
            [
                { q: "GATE stands for?", opts: ["Graduate Aptitude Test in Engineering", "Graduate Admission Test for Excellence", "General Aptitude Technology Exam", "Graduate Applications & Technical Exam"], ans: 0 },
                { q: "GATE score is valid for?", opts: ["1 year", "2 years", "3 years", "5 years"], ans: 2 },
                { q: "Engineering Mathematics in GATE includes?", opts: ["Fluid mechanics only", "Linear algebra, calculus, discrete maths", "Engineering history", "Soft skills"], ans: 1 },
                { q: "GATE is conducted by?", opts: ["UGC only", "IISc + 7 IITs on annual rotation", "Ministry of Education", "NTA"], ans: 1 },
                { q: "Negative marking for 1-mark MCQ in GATE?", opts: ["None", "1/4 mark", "1/3 mark", "1/2 mark"], ans: 2 }
            ],[
                { q: "PSU recruitment uses GATE score for?", opts: ["Interview shortlisting only", "Shortlisting and/or final selection", "Replacing written tests only", "No relation"], ans: 1 },
                { q: "General Aptitude weightage in GATE?", opts: ["5 marks", "15 marks", "20 marks", "30 marks"], ans: 1 },
                { q: "Which is NOT a CS GATE topic?", opts: ["DBMS", "Theory of Computation", "Clinical Cardiology", "Operating Systems"], ans: 2 },
                { q: "NAT questions in GATE require?", opts: ["Picking from 4 choices", "Typing the exact numerical answer", "Always 2-mark responses", "Negative marking like MCQ"], ans: 1 },
                { q: "In CS GATE, highest combined weightage is?", opts: ["General Aptitude", "Programming, DS & Algorithms", "Compiler Design alone", "Computer Organisation alone"], ans: 1 }
            ],[
                { q: "GATE total exam duration?", opts: ["1 hour", "2 hours", "3 hours", "4 hours"], ans: 2 },
                { q: "GATE score maximum is?", opts: ["100", "150", "1000", "500"], ans: 2 },
                { q: "A good GATE CS rank for top IITs M.Tech is?", opts: ["Under 5000", "Under 2000", "Under 200", "Under 50"], ans: 1 },
                { q: "PSU jobs via GATE in CS mostly come from?", opts: ["Power sector PSUs", "IT/Tech PSUs (BSNL, ECIL, DRDO, BARC)", "Railways only", "Defence manufacturing only"], ans: 1 },
                { q: "GATE allows a candidate to appear in?", opts: ["1 paper", "2 papers (core + aptitude counted separately)", "3 different papers", "Unlimited papers"], ans: 0 }
            ]
        ],
        'banking-exams': [
            [
                { q: "Repo Rate is the rate at which?", opts: ["Banks lend to the public", "RBI lends short-term funds to banks", "Govt borrows from RBI", "Banks lend to each other overnight"], ans: 1 },
                { q: "IBPS stands for?", opts: ["International Bank of Personnel Selection", "Institute of Banking Personnel Selection", "Indian Banking & Placement Services", "Integrated Banking Process System"], ans: 1 },
                { q: "CRR stands for?", opts: ["Cash Reserve Ratio", "Credit Rating Ratio", "Central Repo Rate", "Current Remittance Rate"], ans: 0 },
                { q: "SLR stands for?", opts: ["Statutory Liquidity Ratio", "Structured Loan Ratio", "Standard Lending Rate", "Sovereign Liquidity Ratio"], ans: 0 },
                { q: "Data Interpretation in banking tests?", opts: ["Vocabulary skills", "Quantitative reasoning and pattern recognition", "General knowledge of history", "Political awareness"], ans: 1 }
            ],[
                { q: "NABARD funds?", opts: ["Urban industries", "Agriculture and rural development", "Import/Export firms", "Defence sector"], ans: 1 },
                { q: "Good CIBIL score for loan approval?", opts: ["300-500", "550-650", "750-900", "100-300"], ans: 2 },
                { q: "KYC stands for?", opts: ["Know Your Credit", "Know Your Customer", "Key Yield Calculation", "Know Your Company"], ans: 1 },
                { q: "Base Rate is the?", opts: ["Maximum lending rate", "Minimum rate below which banks cannot lend", "RBI's overnight repo rate", "Annual inflation rate"], ans: 1 },
                { q: "PMJDY aims to?", opts: ["Provide free education", "Ensure universal banking access for unbanked sections", "Provide free healthcare", "Subsidize housing loans"], ans: 1 }
            ],[
                { q: "Group Discussion in banking tests?", opts: ["Technical finance skills only", "Communication, reasoning, team collaboration", "Math ability only", "Computer proficiency only"], ans: 1 },
                { q: "NACH mandate is used for?", opts: ["Stock market trading", "Automated recurring payments (EMIs, SIPs)", "Foreign currency exchange", "Insurance claims"], ans: 1 },
                { q: "RBI was established in?", opts: ["1935", "1947", "1950", "1960"], ans: 0 },
                { q: "Probationary Officer (PO) in a bank is?", opts: ["Temporary role with no growth", "Entry-level officer with defined management growth path", "Purely clerical support post", "A contractual part-time role"], ans: 1 },
                { q: "Primary role of a commercial bank?", opts: ["Policy making for economy", "Accepting deposits and providing credit/loans", "Printing currency notes", "Regulating all other banks"], ans: 1 }
            ]
        ],
        'cfa': [
            [
                { q: "CFA Code of Ethics requires?", opts: ["Maximizing short-term returns always", "Acting with integrity and in clients' best interests", "Following employer instructions at all times", "Prioritizing personal financial gain"], ans: 1 },
                { q: "Time Value of Money states?", opts: ["Money always loses value", "A dollar today is worth more than a future dollar", "Future money is worth more than today's", "Value of money is always constant"], ans: 1 },
                { q: "DCF stands for?", opts: ["Direct Cost Framework", "Discounted Cash Flow", "Dynamic Capital Fund", "Debt Coverage Factor"], ans: 1 },
                { q: "Beta in finance measures?", opts: ["Dividend yield of a stock", "A stock's systematic (market) risk", "Bond credit quality", "Portfolio total return"], ans: 1 },
                { q: "CFA Level 1 primarily tests?", opts: ["Portfolio management execution", "Knowledge and understanding of investment tools", "Applied valuation models", "Portfolio strategy and synthesis"], ans: 1 }
            ],[
                { q: "P/E Ratio stands for?", opts: ["Profit/Equity", "Price-to-Earnings Ratio", "Portfolio/Equity", "Projected/Expected Returns"], ans: 1 },
                { q: "Bond duration measures?", opts: ["Credit quality rating", "Bond price sensitivity to interest rate changes", "Currency exchange risk", "Quarterly dividend yield"], ans: 1 },
                { q: "Intrinsic value in equity is?", opts: ["Current market trading price", "Estimated fundamental value from analysis", "Balance sheet book value only", "Stock dividend yield"], ans: 1 },
                { q: "FCFF stands for?", opts: ["Financial Cash From Funds", "Free Cash Flow to the Firm", "Forward Cash Flow Fund", "Fixed Capital Flow Factor"], ans: 1 },
                { q: "CFA Level 2 focuses on?", opts: ["Basic accounting only", "Application of investment tools and asset valuation", "Portfolio management strategy", "Behavioral finance exclusively"], ans: 1 }
            ],[
                { q: "An IPS (Investment Policy Statement) defines?", opts: ["Annual market predictions", "Client objectives, risk tolerance and investment constraints", "Analyst qualifications", "Regulatory filings"], ans: 1 },
                { q: "Strategic asset allocation means?", opts: ["Picking individual stocks frequently", "Setting long-term target weights across asset classes", "Market timing decisions", "Concentrating in one sector"], ans: 1 },
                { q: "GIPS stands for?", opts: ["Global Investment Performance Standards", "General Income Profit System", "Global Index Pricing Standard", "Gross Income Performance Statement"], ans: 0 },
                { q: "Behavioral finance studies?", opts: ["Only fully rational investor behavior", "Psychological biases influencing investor behavior", "Only algorithmic trading strategies", "Tax planning for portfolios"], ans: 1 },
                { q: "Private wealth management primarily serves?", opts: ["Only institutional funds", "Individual high-net-worth clients' financial planning", "Hedge funds exclusively", "Government bond investors only"], ans: 1 }
            ]
        ],
        'digital-marketing': [
            [
                { q: "SEO stands for?", opts: ["Social Engagement Output", "Search Engine Optimization", "Site Error Override", "Search Event Operations"], ans: 1 },
                { q: "CTR means?", opts: ["Content Transfer Rate", "Click-Through Rate", "Customer Tracking Report", "Campaign Total Revenue"], ans: 1 },
                { q: "On-page SEO involves?", opts: ["Building backlinks only", "Optimizing title tags, meta descriptions, and content", "Only running paid search ads", "Managing email campaigns"], ans: 1 },
                { q: "Keyword difficulty indicates?", opts: ["How hard the keyword is to type", "How competitive a keyword is to rank for organically", "Page loading time for a term", "Total number of search results"], ans: 1 },
                { q: "Google Analytics tracks?", opts: ["Only paid traffic data", "Visitor behavior, traffic sources, and conversions", "Only email campaign stats", "Social media follower counts"], ans: 1 }
            ],[
                { q: "Google Ads billing model is?", opts: ["Monthly flat subscription fee", "Pay-Per-Click (PPC) — pay per user click", "Annual contract commitment only", "Revenue sharing commission"], ans: 1 },
                { q: "A/B testing in marketing compares?", opts: ["Two teams' performance", "Two content versions to find the better performer", "Two different target markets", "Two competing brands only"], ans: 1 },
                { q: "Meta Ads Manager is used to?", opts: ["Build and host websites", "Create and manage paid ads on Facebook/Instagram", "Manage email marketing campaigns", "Track organic SEO rankings"], ans: 1 },
                { q: "ROI in marketing stands for?", opts: ["Rate of Interest", "Return on Investment", "Revenue Over Impressions", "Reach of Influence"], ans: 1 },
                { q: "Conversion rate is?", opts: ["Impressions divided by spend", "Desired actions completed / Total visitors × 100", "Total clicks per advertising cost", "Total reach / Frequency"], ans: 1 }
            ],[
                { q: "Email open rate formula is?", opts: ["Clicks / Total Sent", "Emails Opened / Emails Delivered × 100", "Replies / Opens", "Unsubscribes / Total Sent"], ans: 1 },
                { q: "Marketing automation tools enable?", opts: ["Only manual one-off ad creation", "Automated triggered personalized campaigns at scale", "Physical direct mail only", "Inbound phone call routing"], ans: 1 },
                { q: "HubSpot is?", opts: ["A social media platform", "A CRM and marketing automation platform", "A search engine alternative", "An email provider only"], ans: 1 },
                { q: "Attribution modeling in marketing shows?", opts: ["Only last-click credit", "How different touchpoints contribute to conversions", "Only mobile traffic sources", "Total advertising spend breakdown"], ans: 1 },
                { q: "Google Analytics 4 (GA4) uses?", opts: ["Session-based tracking only", "An event-driven data model", "Cookie-only tracking", "Manual data upload"], ans: 1 }
            ]
        ],
        'product-management': [
            [
                { q: "A Product Manager does NOT primarily?", opts: ["Define product strategy", "Write production code", "Prioritize the backlog", "Understand user needs"], ans: 1 },
                { q: "User stories follow the format?", opts: ["As a [user], I want [feature], so that [benefit]", "Feature: [name], Priority: [level]", "Task: [action], Owner: [name]", "Test: [scenario], Result: [pass/fail]"], ans: 0 },
                { q: "Jobs-to-be-done framework focuses on?", opts: ["Job titles of target users", "The underlying goal the user is trying to accomplish", "Company org chart design", "Sprint planning ceremonies"], ans: 1 },
                { q: "Product vision is a?", opts: ["Detailed technical specification", "Long-term aspiration for where the product is heading", "Marketing headline only", "Quarterly revenue target"], ans: 1 },
                { q: "User research is done to?", opts: ["Create the visual UI design", "Validate assumptions and deeply understand user needs", "Define sprint goals for all teams", "Manage the development team"], ans: 1 }
            ],[
                { q: "PRD stands for?", opts: ["Product Roadmap Draft", "Product Requirements Document", "Project Release Date", "Product Review Decision"], ans: 1 },
                { q: "In Scrum, the Product Owner?", opts: ["Manages daily dev team work", "Prioritizes the product backlog", "Facilitates the daily standup", "Performs QA testing"], ans: 1 },
                { q: "RICE prioritization formula is?", opts: ["Reach × Impact × Confidence / Effort", "Revenue × Impact × Cost / Efficiency", "Risk × Implementation × Cost / Effort", "Reach × Iterability × Confidence / Evaluation"], ans: 0 },
                { q: "North Star Metric represents?", opts: ["Total company revenue only", "The single metric that best captures core user value delivered", "Number of features shipped per sprint", "Total bug count across product"], ans: 1 },
                { q: "MVP (Minimum Viable Product) is?", opts: ["A fully-featured first release", "The smallest product to test a core hypothesis", "A minimum-budget product", "A static prototype only"], ans: 1 }
            ],[
                { q: "Go-to-market strategy defines?", opts: ["How to architect the product", "How to launch and reach the target market", "What the technical architecture is", "Which development methodology to use"], ans: 1 },
                { q: "Product-market fit means?", opts: ["Product is present in all markets", "Product strongly satisfies the target market's needs", "Product is always profitable immediately", "Product has the most features"], ans: 1 },
                { q: "Churn rate measures?", opts: ["Number of new users acquired", "Rate at which users stop using the product", "Overall revenue growth rate", "Feature delivery completion rate"], ans: 1 },
                { q: "A PM interview 'design a product' question expects?", opts: ["Low-level technical code design", "Structured user-centric product thinking", "Detailed financial projections", "A complete marketing plan"], ans: 1 },
                { q: "Growth hacking in product means?", opts: ["Illegally accessing user data", "Creative, data-driven strategies to grow the user base rapidly", "Building features faster only", "Reducing all security measures"], ans: 1 }
            ]
        ],
        'financial-modeling': [
            [
                { q: "Excel's VLOOKUP requires the lookup column to be?", opts: ["Sorted in descending order", "Sorted ascending or use exact match (FALSE)", "Formatted as CSV", "Pre-filtered"], ans: 1 },
                { q: "Which statement shows profitability over time?", opts: ["Balance Sheet", "Income Statement (P&L)", "Cash Flow Statement", "Statement of Changes in Equity"], ans: 1 },
                { q: "EBITDA stands for?", opts: ["Earnings Before Interest, Taxes, Depreciation, Amortization", "Estimated Budget Including Total Depreciation Amounts", "External Business Investment Through Debt Arrangement", "Equity Before Interest Taxes Due Amount"], ans: 0 },
                { q: "Working capital = ?", opts: ["Total Assets - Total Liabilities", "Current Assets - Current Liabilities", "Revenue - COGS", "Fixed Assets - Long-term Debt"], ans: 1 },
                { q: "A model's assumptions section contains?", opts: ["Historical actuals only", "Input variables that drive the model's projected outputs", "Final exported PDF reports", "Change log and audit records"], ans: 1 }
            ],[
                { q: "The 3 statements are linked because?", opts: ["They are fully independent", "Net income → retained earnings; Cash from CF → Balance Sheet", "They only share revenue line", "They share the same column format"], ans: 1 },
                { q: "CapEx stands for?", opts: ["Capital Expenditure (long-term asset investment)", "Cash and Payroll Expenses", "Current Account Position Exchange", "Cost and Profit Examination"], ans: 0 },
                { q: "Depreciation on the Income Statement?", opts: ["Increases total revenue", "Reduces pre-tax income as a non-cash expense", "Directly increases total assets", "Reduces total equity directly"], ans: 1 },
                { q: "Revenue drivers in a model are?", opts: ["Audit adjustments only", "Key assumptions like price × volume that forecast revenue", "Fixed historical data always", "Unchanging constants"], ans: 1 },
                { q: "Scenario analysis tests?", opts: ["Only the base case", "How outputs shift under different assumption sets (bull/base/bear)", "Historical accounting accuracy only", "Foreign currency risk only"], ans: 1 }
            ],[
                { q: "DCF Terminal Value (Gordon Growth Model) is?", opts: ["FCF / (WACC - g) in the terminal year", "FCF × exit EBITDA multiple only", "Net income × P/E in terminal year", "Revenue × target margin"], ans: 0 },
                { q: "LBO stands for?", opts: ["Leveraged Buyout", "Long Bond Offer", "Liquid Balance Option", "Levered Business Operation"], ans: 0 },
                { q: "Primary sources of LBO return are?", opts: ["Dividends paid only", "Debt paydown, EBITDA growth, and multiple expansion", "Tax refunds only", "Interest income earned only"], ans: 1 },
                { q: "WACC stands for?", opts: ["Weighted Average Cost of Capital", "Working Asset Cash Conversion", "Weekly Adjusted Capital Cost", "Weighted Amortization Capital Calculation"], ans: 0 },
                { q: "M&A deal accretion means?", opts: ["Deal reduces acquirer's EPS post-close", "Deal increases acquirer's EPS post-acquisition", "Deal is completely cash-neutral", "Deal destroys shareholder value"], ans: 1 }
            ]
        ],
        'investment-banking': [
            [
                { q: "Investment banks primarily provide?", opts: ["Retail savings accounts", "Capital raising and M&A advisory services", "Life insurance products", "Pension fund management"], ans: 1 },
                { q: "An IPO is when?", opts: ["A company issues new bonds", "A company lists its shares publicly for the first time", "A company acquires a competitor", "A company announces a dividend"], ans: 1 },
                { q: "Buy-side refers to?", opts: ["Investment banks only", "Firms that invest capital (PE, hedge funds, mutual funds)", "Regulators and compliance", "Retail brokers only"], ans: 1 },
                { q: "Sell-side refers to?", opts: ["Retail investors only", "Firms that sell/issue securities (IBanks, brokers)", "Only portfolio managers", "Only government entities"], ans: 1 },
                { q: "Bulge bracket banks are?", opts: ["Small boutique advisory firms", "Large global full-service investment banks", "Only regional mid-size banks", "Central banks like the Fed"], ans: 1 }
            ],[
                { q: "In M&A, an acquisition premium is paid over the target's?", opts: ["Book value only", "Current market price — to incentivize shareholders to sell", "Historical revenue figures", "Bond credit rating"], ans: 1 },
                { q: "A fairness opinion in M&A is?", opts: ["A marketing document for the deal", "An independent assessment that deal price is fair to shareholders", "A regulatory government approval", "An early term sheet in the deal"], ans: 1 },
                { q: "A pitch book in IB is?", opts: ["An employee training manual", "A presentation prepared to win a client mandate", "A mandatory SEC regulatory filing", "A syndicated market data report"], ans: 1 },
                { q: "An LBO uses?", opts: ["Only equity to acquire the target", "Mostly debt financing to acquire a company", "No external financing at all", "Government grants and subsidies"], ans: 1 },
                { q: "Comparable company analysis (comps) values by?", opts: ["Internal DCF projections only", "Benchmarking against similar publicly traded companies", "Historical acquisition cost only", "Patent and IP value only"], ans: 1 }
            ],[
                { q: "Origination in IB means?", opts: ["Executing existing trades", "Sourcing and developing new client relationships and deals", "Processing financial settlements", "Writing regulatory filings"], ans: 1 },
                { q: "Syndication in IB means?", opts: ["Executive team restructuring", "Distributing securities to a group of underwriters/investors", "Internal team collaboration", "Mandatory regulatory compliance reporting"], ans: 1 },
                { q: "A typical IB analyst (Analyst level) works approximately?", opts: ["40 hours/week", "60 hours/week", "80-100+ hours/week", "25 hours/week"], ans: 2 },
                { q: "A 'tombstone' in IB is?", opts: ["A failed deal announcement", "A public advertisement celebrating a completed transaction", "A candidate rejection letter", "A deal risk assessment report"], ans: 1 },
                { q: "IB technical interviews test?", opts: ["Personality and leadership only", "Accounting, valuation, and deal mechanics knowledge", "Coding and software skills", "Marketing and branding knowledge"], ans: 1 }
            ]
        ]
    });

    // Generic fallback questions for any course
    const GENERIC_QUIZ = level => [
        { q: `What is the most important skill at the ${level} stage?`, opts: ["Speed", "Deep understanding of fundamentals", "Memorization", "Copying code"], ans: 1 },
        { q: "What is the best approach when stuck on a problem?", opts: ["Give up", "Break it down into smaller steps", "Skip it entirely", "Ask immediately without trying"], ans: 1 },
        { q: "Which resource is most reliable for learning?", opts: ["Social media posts", "Official documentation", "Random blogs", "YouTube shorts only"], ans: 1 },
        { q: "What does consistent daily practice help with?", opts: ["Nothing", "Building strong long-term retention", "Only short-term memory", "Increasing stress"], ans: 1 },
        { q: "How should you approach a new module?", opts: ["Jump to advanced topics", "Start from basics and build up", "Only watch videos", "Skip theoretical concepts"], ans: 1 }
    ];

    function getQuizQuestions(pathKey, milestoneIndex) {
        const bank = QUIZ_BANK[pathKey];
        let originalQuestions = [];
        const milestoneLevel = ROADMAP_DATA[pathKey]?.milestones[milestoneIndex]?.level || 'Intermediate';

        if (bank && bank[milestoneIndex]) {
            originalQuestions = [...bank[milestoneIndex]];
        } else {
            originalQuestions = [...GENERIC_QUIZ(milestoneLevel)];
        }

        // 5. Dynamic Question Logic: Shuffle and take 5
        const shuffled = originalQuestions.sort(() => 0.5 - Math.random());
        return shuffled.slice(0, 5);
    }

    // =============================================
    // COURSE STYLE MAP (reused from card rendering)
    // =============================================
    function getCourseStyle(key) {
        return (typeof COURSE_STYLES !== 'undefined' && COURSE_STYLES[key]) ||
            { gradient: 'linear-gradient(135deg, #1a1a2e, #6c3483)', icon: 'star', tag: 'Career' };
    }

    // =============================================
    // PATH SELECTION & DIAGNOSTICS
    // =============================================
    function handlePathSelection(pathKey) {
        if (!currentUser) {
            showLogin();
            return;
        }
        
        if (userData.scores[pathKey] && Object.keys(userData.scores[pathKey]).length > 0) {
            showRoadmap(pathKey);
        } else {
            startDiagnosticTest(pathKey);
        }
    }

    let activeDiagState = { pathKey: null, questions: [], currentQ: 0, score: 0, selectedOpt: null };

    window.startDiagnosticTest = (pathKey) => {
        const pathData = ROADMAP_DATA[pathKey];
        // Use generic quiz or first module questions
        const questions = getQuizQuestions(pathKey, 0).slice(0, 5);
        activeDiagState = { pathKey, questions, currentQ: 0, score: 0, selectedOpt: null };

        document.getElementById('diag-modal-title').textContent = `${pathData.title} Placement Test`;
        document.getElementById('diag-q-count').textContent = questions.length;

        document.getElementById('diag-intro-state').style.display = 'block';
        document.getElementById('diag-question-state').style.display = 'none';
        document.getElementById('diag-result-state').style.display = 'none';
        document.getElementById('diagnostic-modal').style.display = 'flex';
        lucide.createIcons();
    };

    function renderDiagQuestion() {
        const { questions, currentQ } = activeDiagState;
        const q = questions[currentQ];
        const total = questions.length;

        document.getElementById('diag-q-progress').textContent = `${currentQ + 1} / ${total}`;
        document.getElementById('diag-q-fill').style.width = `${((currentQ + 1) / total) * 100}%`;
        document.getElementById('diag-question-text').textContent = q.q;

        const optContainer = document.getElementById('diag-options');
        optContainer.innerHTML = '';
        q.opts.forEach((opt, i) => {
            const btn = document.createElement('button');
            btn.className = 'test-option';
            btn.textContent = opt;
            btn.onclick = () => selectDiagOption(i);
            optContainer.appendChild(btn);
        });

        const nextBtn = document.getElementById('next-diag-btn');
        nextBtn.disabled = true;
        nextBtn.style.opacity = '0.4';
        nextBtn.textContent = currentQ < total - 1 ? 'Next Question' : 'See Results';
        activeDiagState.selectedOpt = null;
    }

    function selectDiagOption(selectedIndex) {
        const { questions, currentQ } = activeDiagState;
        const correct = questions[currentQ].ans;

        document.querySelectorAll('#diag-options .test-option').forEach((btn, i) => {
            btn.classList.remove('selected', 'correct', 'wrong');
            if (i === correct) btn.classList.add('correct');
            else if (i === selectedIndex && selectedIndex !== correct) btn.classList.add('wrong');
            btn.onclick = null;
        });

        if (selectedIndex === correct) activeDiagState.score++;
        activeDiagState.selectedOpt = selectedIndex;

        const nextBtn = document.getElementById('next-diag-btn');
        nextBtn.disabled = false;
        nextBtn.style.opacity = '1';
    }

    function showDiagResults() {
        const { pathKey, questions, score } = activeDiagState;
        const pct = Math.round((score / questions.length) * 100);

        document.getElementById('diag-score-text').textContent = `${pct}%`;
        const circle = document.getElementById('diag-score-circle');
        circle.style.borderColor = pct >= 80 ? 'var(--success)' : pct >= 60 ? 'var(--warning)' : 'var(--danger)';
        circle.style.background = pct >= 80 ? 'rgba(34,197,94,0.1)' : pct >= 60 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)';

        let message;
        if (!userData.scores[pathKey]) userData.scores[pathKey] = {};
        
        if (pct >= 80) {
            message = `Great job! You scored ${pct}%. We've auto-mastered Module 1 for you!`;
            userData.scores[pathKey][0] = pct;
        } else {
            message = `You scored ${pct}%. We recommend starting from Module 1 to build a solid foundation.`;
        }

        if (currentUser) {
            updateDoc(doc(db, 'users', currentUser.uid), {
                [`scores.${pathKey}`]: userData.scores[pathKey]
            }).catch(e => console.error(e));
        }

        document.getElementById('diag-message').textContent = message;
        document.getElementById('diag-question-state').style.display = 'none';
        document.getElementById('diag-result-state').style.display = 'block';
    }

    // =============================================
    // SHOW ROADMAP — Visual Node Path
    // =============================================
    function showRoadmap(pathKey) {
        currentPath = pathKey;
        const pathData = ROADMAP_DATA[pathKey];
        const courseStyle = getCourseStyle(pathKey);
        const scores = userData.scores[pathKey] || {};

        // Set course header
        document.getElementById('roadmap-title').textContent = pathData.title;
        document.getElementById('roadmap-desc').textContent = pathData.description;

        const iconEl = document.getElementById('roadmap-course-icon');
        iconEl.style.background = courseStyle.gradient;
        iconEl.innerHTML = `<i data-lucide="${courseStyle.icon}"></i>`;

        // Calculate overall progress
        const totalModules = pathData.milestones.length;
        const completedModules = Object.keys(scores).length;
        const progressPct = Math.round((completedModules / totalModules) * 100);
        document.getElementById('roadmap-progress-fill').style.width = `${progressPct}%`;
        document.getElementById('roadmap-progress-label').textContent = `${progressPct}% Complete · ${completedModules}/${totalModules} modules`;

        // Contest Banner & Platform Logic
        const contestBannerCont = document.getElementById('contest-banner-container');
        const platformStatsCont = document.getElementById('platform-stats-container');
        contestBannerCont.style.display = 'none';
        platformStatsCont.style.display = 'none';

        // Check if path has required contests
        const requiredContests = (typeof UPCOMING_CONTESTS !== 'undefined' ? UPCOMING_CONTESTS : []).filter(c => c.requiredFor.includes(pathKey));
        let highestContestScore = null;
        let highestPlatform = null;
        let isPlatformLocked = false;

        if (requiredContests.length > 0) {
            // Find highest score among required platforms
            requiredContests.forEach(c => {
                if (userData.platformScores && userData.platformScores[c.platform]) {
                    const sc = userData.platformScores[c.platform].score;
                    if (highestContestScore === null || sc > highestContestScore) {
                        highestContestScore = sc;
                        highestPlatform = c.platform;
                    }
                }
            });

            // Need to attend if they've completed >=1 module and no score
            if (completedModules > 0 && highestContestScore === null) {
                isPlatformLocked = true;
            }

            // Render Banner
            const upcoming = requiredContests[0]; // Just take first upcoming
            contestBannerCont.style.display = 'block';
            contestBannerCont.innerHTML = `
                <div style="background: linear-gradient(135deg, rgba(59,104,82,0.1), rgba(188,238,210,0.2)); border: 1px solid var(--primary); padding: 15px 20px; border-radius: 12px; display: flex; align-items: center; justify-content: space-between;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <i data-lucide="bell-ring" style="color: var(--primary);"></i>
                        <div>
                            <h4 style="margin: 0; color: var(--text-primary);">Mandatory Contest: ${upcoming.title} on ${upcoming.platform}</h4>
                            <p style="margin: 0; font-size: 0.85rem; color: var(--text-secondary);">Date: ${upcoming.date} — You must attend to generate future day-by-day schedules.</p>
                        </div>
                    </div>
                    <button class="btn-primary" id="remind-email-btn" onclick="toggleEmailReminder(this)" style="font-size: 0.85rem; padding: 8px 16px;">
                        <i data-lucide="mail"></i> Set Email Reminder
                    </button>
                </div>
            `;

            // Render Stats
            if (highestContestScore !== null) {
                platformStatsCont.style.display = 'block';
                let suggestion = "Keep practicing problem-solving.";
                if (highestContestScore < 1200) suggestion = "Focus on basics: Arrays, Strings, and simple Greedy algorithms.";
                else if (highestContestScore < 1500) suggestion = "Time to study Graphs, DP, and standard tricky variations.";
                else suggestion = "Great rating! Focus on Advanced DP and Segment Trees.";

                platformStatsCont.innerHTML = `
                    <div style="background: white; border: 1px solid var(--border-color); padding: 20px; border-radius: 16px; margin-top: 15px;">
                        <h4 style="margin: 0 0 10px; font-size: 1.1rem; display: flex; align-items: center; gap: 8px;">
                            <i data-lucide="bar-chart-2"></i> ${highestPlatform} Performance Sync
                        </h4>
                        <div style="display: flex; align-items: center; gap: 40px;">
                            <div>
                                <p style="font-size: 0.85rem; color: var(--text-secondary); margin: 0;">Current Rating</p>
                                <p style="font-size: 1.8rem; font-weight: bold; color: var(--primary); margin: 0;">${highestContestScore}</p>
                            </div>
                            <div style="flex: 1;">
                                <p style="font-size: 0.85rem; color: var(--text-secondary); margin: 0;">AI Suggestion</p>
                                <p style="margin: 0; font-weight: 500;">${suggestion}</p>
                            </div>
                        </div>
                    </div>
                `;
            }
        }

        // Render visual nodes
        renderVisualRoadmap(pathKey, pathData.milestones, scores);

        // Render adaptive schedule
        renderAdaptiveSchedule(pathKey, pathData.milestones, scores, { locked: isPlatformLocked, score: highestContestScore });

        // Render job guide
        renderJobGuide(pathData.job_guide);

        // Show roadmap views
        roadmapEmptyState.style.display = 'none';
        roadmapActiveContent.style.display = 'block';
        switchView('roadmap-container');

        // VIDEO PLAYER ENTRY: Show play button if playlist exists
        const playerBtn = document.getElementById('open-course-player');
        if (typeof PLAYLIST_DATA !== 'undefined' && PLAYLIST_DATA[pathKey]) {
            playerBtn.style.display = 'block';
            playerBtn.onclick = () => openCoursePlayer(pathKey);
        } else {
            playerBtn.style.display = 'none';
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // =============================================
    // RENDER VISUAL NODE PATH
    // =============================================
    function renderVisualRoadmap(pathKey, milestones, scores) {
        const container = document.getElementById('visual-roadmap');
        container.innerHTML = '';

        milestones.forEach((milestone, index) => {
            const score = scores[index];
            const isPassed = score !== undefined && score >= 80;
            const isPrevPassed = index === 0 || (scores[index - 1] !== undefined && scores[index - 1] >= 80);
            
            const isCompleted = isPassed;
            const isCurrent = !isPassed && isPrevPassed;
            const isLocked = !isPassed && !isPrevPassed;

            // Connector (skip first)
            if (index > 0) {
                const connector = document.createElement('div');
                const prevPassed = scores[index-1] !== undefined && scores[index-1] >= 80;
                connector.className = `roadmap-connector ${prevPassed ? 'connected' : ''}`;
                container.appendChild(connector);
            }

            // Node row
            const row = document.createElement('div');
            row.className = 'roadmap-node-row';

            const nodeClass = isCompleted ? 'completed' : isCurrent ? 'current' : 'locked';
            const numberIcon = isCompleted ? '✓' : isLocked ? '🔒' : index + 1;

            const skillPills = milestone.skills.map(s => {
                const done = userData.completedSkills.includes(s.name);
                return `<span class="node-skill-pill ${done ? 'done' : ''}">${done ? '✓ ' : ''}${s.name}</span>`;
            }).join('');

            let scoreBadgeHtml = '';
            if (score !== undefined) {
                const cls = score >= 80 ? 'score-excellent' : score >= 60 ? 'score-good' : 'score-needs-work';
                const icon = score >= 80 ? '🏆' : score >= 60 ? '📈' : '🔄';
                scoreBadgeHtml = `<span class="node-score-badge ${cls}">${icon} ${score}% score</span>`;
            }

            const testBtnLabel = isCompleted ? 'Retake to Improve' : score !== undefined ? 'Retake Module Test' : isCurrent ? '▶ Take Module Test' : '🔒 Locked';
            const testBtnDisabled = isLocked ? 'disabled' : '';

            row.innerHTML = `
                <div class="roadmap-node ${nodeClass} fade-in" style="animation-delay: ${index * 0.12}s">
                    <div class="node-number">${numberIcon}</div>
                    <div class="node-content">
                        <div class="node-level">${milestone.level}</div>
                        <div class="node-title">${milestone.title}</div>
                        <div class="node-skills-preview">${skillPills}</div>
                        <div class="node-actions">
                            <button class="take-test-btn" onclick="window.openModuleTest('${pathKey}', ${index})" ${testBtnDisabled}>
                                ${testBtnLabel}
                            </button>
                            ${scoreBadgeHtml}
                        </div>
                    </div>
                </div>
            `;
            container.appendChild(row);
        });

        lucide.createIcons();
    }

    // =============================================
    // ADAPTIVE SCHEDULE GENERATOR — Day-by-Day
    // =============================================
    window.toggleEmailReminder = function(btn) {
        if (btn.classList.contains('reminded')) {
            btn.classList.remove('reminded');
            btn.innerHTML = `<i data-lucide="mail"></i> Set Email Reminder`;
            btn.style.background = 'var(--primary)';
        } else {
            btn.classList.add('reminded');
            btn.innerHTML = `<i data-lucide="check-circle" style="color:white;"></i> Reminder Sent!`;
            btn.style.background = 'var(--success)';
            alert('A reminder has been scheduled for your registered email address!');
        }
        lucide.createIcons();
    };

    function renderAdaptiveSchedule(pathKey, milestones, scores, contestData = { locked: false, score: null }) {
        const container = document.getElementById('schedule-weeks');
        const subtitleEl = document.querySelector('.schedule-subtitle');
        container.innerHTML = '';

        const hasAnyScore = Object.keys(scores).length > 0;
        let dailyHours = userData.dailyHours || 2; // default 2 hrs/day
        const pathData = ROADMAP_DATA[pathKey];

        // Apply global modifier if platform score is low
        if (contestData.score !== null && contestData.score < 1200) {
            dailyHours = Math.max(0.5, dailyHours - 0.5); // Example: force slower schedule by reducing effective capacity
        }

        if (!hasAnyScore) {
            subtitleEl.textContent = 'Complete a module test to generate your personalized day-by-day roadmap!';
            container.innerHTML = `
                <div class="schedule-setup-card">
                    <div style="font-size:2rem; margin-bottom:12px;">⏱️</div>
                    <h4 style="margin:0 0 8px; font-size:1rem;">Set Your Daily Study Hours</h4>
                    <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:16px;">How many hours per day can you dedicate?</p>
                    <div class="hours-selector" id="hours-selector-setup">
                        ${[1,1.5,2,3,4].map(h => `<button class="hours-btn ${h===dailyHours?'active':''}" data-hours="${h}">${h}h/day</button>`).join('')}
                    </div>
                    <p style="margin-top:16px; font-size:0.85rem; color:var(--text-secondary);">Take the first module test to unlock your roadmap 🚀</p>
                </div>
            `;
            setupHoursSelector('#hours-selector-setup');
            return;
        }

        subtitleEl.textContent = '';
        subtitleEl.innerHTML = '';

        // Build the header control bar
        const headerBar = document.createElement('div');
        headerBar.className = 'schedule-header-bar';
        headerBar.innerHTML = `
            <div class="schedule-meta-strip">
                <span class="schedule-meta-item"><span>📅</span> Day-by-Day Plan</span>
                <span class="schedule-meta-item"><span>⏱️</span> <strong>${dailyHours}h/day</strong></span>
                <span class="schedule-meta-item">Based on your quiz scores</span>
            </div>
            <div class="hours-selector" id="hours-selector-inline">
                ${[1,1.5,2,3,4].map(h => `<button class="hours-btn ${h===dailyHours?'active':''}" data-hours="${h}">${h}h/day</button>`).join('')}
            </div>
        `;
        container.appendChild(headerBar);
        setupHoursSelector('#hours-selector-inline', pathKey, milestones, scores);

        // Generate and render the day schedule
        const dayPlan = buildDayPlan(pathKey, milestones, scores, dailyHours, contestData.locked);
        renderDayPlan(container, dayPlan, scores);
    }

    function buildDayPlan(pathKey, milestones, scores, dailyHours, contestLocked = false) {
        const pathData = ROADMAP_DATA[pathKey];
        const dailyTopics = pathData.dailyTopics || {};
        const plan = [];
        let dayNumber = 1;
        
        let modulesToProcess = milestones;
        if (contestLocked) {
            modulesToProcess = [milestones[0]];
        }

        modulesToProcess.forEach((milestone, moduleIdx) => {
            const score = scores[moduleIdx];
            let baseHours = milestone.hoursNeeded || 10;

            let totalHours;
            let status, statusLabel;
            if (score === undefined) {
                totalHours = baseHours;
                status = 'upcoming';
                statusLabel = 'Upcoming';
            } else if (score >= 80) {
                totalHours = Math.ceil(baseHours * 0.6);
                status = 'on-track';
                statusLabel = '🏆 Excellent';
            } else if (score >= 60) {
                totalHours = baseHours;
                status = 'on-track';
                statusLabel = '📈 Good';
            } else {
                totalHours = Math.ceil(baseHours * 1.5);
                status = 'needs-work';
                statusLabel = '🔄 Needs Practice';
            }
            
            if (window.highestContestScore && window.highestContestScore < 1200) {
                 totalHours += 2;
            }

            let topicPool = dailyTopics[moduleIdx] || milestone.skills.map(s => s.name);
            if (topicPool.length === 0) topicPool = ['Review fundamentals', 'Practice exercises', 'Project integration'];
            
            while (totalHours > 0) {
                const hrsForDay = Math.min(totalHours, dailyHours);
                totalHours -= hrsForDay;
                
                const dayTopic = topicPool[(dayNumber - 1) % topicPool.length];

                plan.push({
                    day: dayNumber,
                    moduleIdx,
                    title: milestone.title,
                    topic: dayTopic,
                    hours: hrsForDay,
                    status,
                    statusLabel
                });
                dayNumber++;
            }
        });
        
        if (contestLocked && milestones.length > 1) {
            plan.push({
                lockedNotice: true,
                day: dayNumber,
                title: "Schedule Locked",
                topic: "Attend the upcoming contest on LeetCode/CodeChef to unlock further day-by-day scheduling."
            });
        }

        return plan;
    }

    function renderDayPlan(container, plan, scores) {
        if (!plan || plan.length === 0) return;

        let currentModule = -1;

        plan.forEach((day, idx) => {
            if (day.lockedNotice) {
                 const notice = document.createElement('div');
                 notice.style.cssText = "grid-column: 1/-1; background: rgba(239,68,68,0.1); border: 1px dashed var(--danger); padding: 20px; border-radius: 12px; text-align: center; color: var(--danger); font-weight: 500; margin-top: 15px;";
                 notice.innerHTML = `<i data-lucide="lock" style="margin-bottom: 8px;"></i><br>${day.topic}`;
                 container.appendChild(notice);
                 return;
            }

            // Module separator
            if (day.moduleIdx !== currentModule) {
                currentModule = day.moduleIdx;
                const sep = document.createElement('div');
                const score = scores[day.moduleIdx];
                sep.className = `module-separator status-${day.status}`;
                sep.innerHTML = `
                    <div class="module-sep-title">
                        <span class="module-sep-num">Module ${day.moduleIdx + 1}</span>
                        <span class="module-sep-name">${day.title}</span>
                        ${score !== undefined ? `<span class="module-sep-score" style="background:${score>=80?'var(--success)':score>=60?'var(--warning)':'var(--danger)'}20; color:${score>=80?'var(--success)':score>=60?'var(--warning)':'var(--danger)'}">Score: ${score}%</span>` : '<span class="module-sep-score" style="background:rgba(150,150,150,0.1);">Not tested</span>'}
                        <span class="module-sep-tag">${day.statusLabel}</span>
                    </div>
                `;
                container.appendChild(sep);
            }

            const card = document.createElement('div');
            card.className = `day-card status-${day.status}`;

            card.innerHTML = `
                <div class="day-card-left">
                    <div class="day-number">Day ${day.day}</div>
                </div>
                <div class="day-card-body">
                    <div class="day-topics-wrap"><span class="day-topic-chip">${day.topic}</span></div>
                    <div class="day-footer">
                        <span class="day-hours">⏱ ${day.hours}h today</span>
                    </div>
                </div>
            `;
            container.appendChild(card);
        });

        // Summary
        const totalDays = plan[plan.length - 1]?.day || plan[plan.length - 2]?.day || 0;
        const summary = document.createElement('div');
        summary.className = 'schedule-summary-card';
        summary.innerHTML = `
            <div class="summary-icon">🎓</div>
            <div class="summary-text">
                <strong>Course completion estimate: ${totalDays} days</strong>
                <span>at ${userData.dailyHours || 2}h/day</span>
            </div>
            <div class="summary-miss-note">Missed a day? Your tasks automatically carry over to the next day.</div>
        `;
        container.appendChild(summary);
    }

    function setupHoursSelector(selector, pathKey, milestones, scores) {
        const container = document.querySelector(selector);
        if (!container) return;
        container.querySelectorAll('.hours-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const hours = parseFloat(btn.dataset.hours);
                userData.dailyHours = hours;
                // Persist
                if (currentUser) {
                    updateDoc(doc(db, 'users', currentUser.uid), { dailyHours: hours }).catch(e => console.error(e));
                }
                // Re-render schedule
                if (currentPath) {
                    const pData = ROADMAP_DATA[currentPath];
                    const pScores = userData.scores[currentPath] || {};
                    renderAdaptiveSchedule(currentPath, pData.milestones, pScores);
                }
            });
        });
    }

    // =============================================
    // MODULE TEST ENGINE
    // =============================================
    let activeTestState = { pathKey: null, milestoneIndex: null, questions: [], currentQ: 0, score: 0, selectedOpt: null };

    window.openModuleTest = (pathKey, milestoneIndex) => {
        const milestone = ROADMAP_DATA[pathKey].milestones[milestoneIndex];
        const questions = getQuizQuestions(pathKey, milestoneIndex);
        activeTestState = { pathKey, milestoneIndex, questions, currentQ: 0, score: 0, selectedOpt: null };

        document.getElementById('test-modal-title').textContent = milestone.title;
        document.getElementById('test-intro-desc').textContent =
            `Test your knowledge on "${milestone.title}" (${milestone.level} level). ${questions.length} questions, Adaptive scoring.`;
        document.getElementById('test-q-count').textContent = questions.length;

        // Show intro state
        document.getElementById('test-intro-state').style.display = 'block';
        document.getElementById('test-question-state').style.display = 'none';
        document.getElementById('test-result-state').style.display = 'none';
        document.getElementById('module-test-modal').style.display = 'flex';
        lucide.createIcons();
    };

    function renderCurrentQuestion() {
        const { questions, currentQ } = activeTestState;
        const q = questions[currentQ];
        const total = questions.length;

        document.getElementById('test-q-progress').textContent = `${currentQ + 1} / ${total}`;
        document.getElementById('test-q-fill').style.width = `${((currentQ + 1) / total) * 100}%`;
        document.getElementById('test-question-text').textContent = q.q;

        const optContainer = document.getElementById('test-options');
        optContainer.innerHTML = '';
        q.opts.forEach((opt, i) => {
            const btn = document.createElement('button');
            btn.className = 'test-option';
            btn.textContent = opt;
            btn.onclick = () => selectOption(i);
            optContainer.appendChild(btn);
        });

        const nextBtn = document.getElementById('next-q-btn');
        nextBtn.disabled = true;
        nextBtn.style.opacity = '0.4';
        nextBtn.textContent = currentQ < total - 1 ? 'Next Question' : 'See Results';
        activeTestState.selectedOpt = null;
    }

    function selectOption(selectedIndex) {
        const { questions, currentQ } = activeTestState;
        const correct = questions[currentQ].ans;

        document.querySelectorAll('.test-option').forEach((btn, i) => {
            btn.classList.remove('selected', 'correct', 'wrong');
            if (i === correct) btn.classList.add('correct');
            else if (i === selectedIndex && selectedIndex !== correct) btn.classList.add('wrong');
            btn.onclick = null; // Prevent re-selecting
        });

        if (selectedIndex === correct) activeTestState.score++;
        activeTestState.selectedOpt = selectedIndex;

        const nextBtn = document.getElementById('next-q-btn');
        nextBtn.disabled = false;
        nextBtn.style.opacity = '1';
    }

    function showTestResults() {
        const { pathKey, milestoneIndex, questions, score } = activeTestState;
        const pct = Math.round((score / questions.length) * 100);

        // Save score to Firebase
        if (!userData.scores[pathKey]) userData.scores[pathKey] = {};
        userData.scores[pathKey][milestoneIndex] = pct;
        if (currentUser) {
            updateDoc(doc(db, 'users', currentUser.uid), {
                [`scores.${pathKey}`]: userData.scores[pathKey]
            }).catch(e => console.error("Error saving score:", e));
        }

        // Update result UI
        document.getElementById('result-score-text').textContent = `${pct}%`;
        const circle = document.getElementById('result-score-circle');
        circle.style.borderColor = pct >= 80 ? 'var(--success)' : pct >= 60 ? 'var(--warning)' : 'var(--danger)';
        circle.style.background = pct >= 80 ? 'rgba(34,197,94,0.1)' : pct >= 60 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)';

        let verdict, message, recommendation;
        if (pct >= 80) {
            verdict = '🏆 Excellent!';
            message = `You scored ${pct}% — Outstanding performance!`;
            recommendation = `<strong>AI Recommendation:</strong> You've mastered this module. Your schedule will be set to <strong>1 week</strong> for this stage. Move confidently to the next module. Focus next on: <strong>${ROADMAP_DATA[pathKey].milestones[milestoneIndex + 1]?.title || 'Final milestone reached!'}</strong>`;
        } else if (pct >= 60) {
            verdict = '📈 Good Progress!';
            message = `You scored ${pct}% — You're on the right track.`;
            recommendation = `<strong>AI Recommendation:</strong> You have good understanding but need refinement. Your schedule will allocate <strong>2 weeks</strong> for this module. Revisit: <strong>${questions.filter((_,i) => i < 2).map(q => q.q.slice(0,30)+'...').join(', ')}</strong>`;
        } else {
            verdict = '🔄 Keep Going!';
            message = `You scored ${pct}% — Extra practice will get you there.`;
            recommendation = `<strong>AI Recommendation:</strong> This module needs more focus. Your schedule will be extended to <strong>3 weeks</strong>. Re-study all skills in this module and practice with hands-on exercises before moving forward.`;
        }

        document.getElementById('result-verdict').textContent = verdict;
        document.getElementById('result-message').textContent = message;
        document.getElementById('ai-recommendation').innerHTML = recommendation;

        document.getElementById('test-question-state').style.display = 'none';
        document.getElementById('test-result-state').style.display = 'block';
    }

    function renderJobGuide(jobGuide) {
        const jobGuideContent = document.getElementById('job-guide-content');
        jobGuideContent.innerHTML = `
            <div class="guide-item"><strong>Resume Strategy</strong><p>${jobGuide.resume}</p></div>
            <div class="guide-item"><strong>Portfolio Building</strong><p>${jobGuide.portfolio}</p></div>
            <div class="guide-item"><strong>Interview Preparation</strong><p>${jobGuide.interview}</p></div>
        `;
    }

    // =============================================
    // TEST MODAL EVENT LISTENERS
    // =============================================
    function setupTestModalListeners() {
        document.getElementById('start-test-btn').addEventListener('click', () => {
            document.getElementById('test-intro-state').style.display = 'none';
            document.getElementById('test-question-state').style.display = 'block';
            renderCurrentQuestion();
        });

        document.getElementById('next-q-btn').addEventListener('click', () => {
            activeTestState.currentQ++;
            if (activeTestState.currentQ < activeTestState.questions.length) {
                renderCurrentQuestion();
            } else {
                showTestResults();
            }
        });

        document.getElementById('close-test-modal').addEventListener('click', () => {
            document.getElementById('module-test-modal').style.display = 'none';
        });

        document.getElementById('apply-schedule-btn').addEventListener('click', () => {
            document.getElementById('module-test-modal').style.display = 'none';
            // Refresh roadmap with new scores
            if (currentPath) showRoadmap(currentPath);
        });

        document.getElementById('module-test-modal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('module-test-modal')) {
                document.getElementById('module-test-modal').style.display = 'none';
            }
        });
    }


    // --- New Features Logic ---

    function renderQuizzes() {
        const quizzes = [
            { title: "Frontend Basics", questions: 15, duration: "10m", level: "Beginner" },
            { title: "Data Science Logic", questions: 20, duration: "15m", level: "Intermediate" },
            { title: "Cybersecurity Fundamentals", questions: 12, duration: "8m", level: "Beginner" },
            { title: "Product Strategy", questions: 10, duration: "5m", level: "Expert" }
        ];

        quizList.innerHTML = quizzes.map(q => `
            <div class="quiz-card fade-in">
                <div style="display: flex; justify-content: space-between; margin-bottom: 15px;">
                    <span class="skill-badge badge-medium">${q.level}</span>
                    <span style="color: var(--text-secondary); font-size: 0.8rem;">${q.duration}</span>
                </div>
                <h3 style="margin-bottom: 10px;">${q.title}</h3>
                <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 20px;">${q.questions} Multiple Choice Questions</p>
                <button class="btn-primary" style="width: 100%;" onclick="alert('Quiz system starting soon!')">Start Assessment</button>
            </div>
        `).join('');
        lucide.createIcons();
    }

    function updateProfileStats() {
        // 1. Skills Mastered
        const completedCount = userData.completedSkills ? userData.completedSkills.length : 0;
        const skillsValEl = document.getElementById('stats-skills-val');
        if (skillsValEl) skillsValEl.textContent = completedCount;

        // 2. Aggregate Progress
        let totalProgressPct = 0;
        if (currentPath && userData.scores[currentPath]) {
            const scores = userData.scores[currentPath];
            const milestoneCount = ROADMAP_DATA[currentPath].milestones.length;
            const completedMilestones = Object.keys(scores).filter(k => scores[k] >= 80).length;
            totalProgressPct = Math.round((completedMilestones / milestoneCount) * 100);
        }
        
        const progressValEl = document.getElementById('stats-progress-val');
        if (progressValEl) progressValEl.textContent = `${totalProgressPct}%`;

        // 3. Certificates (Badges) - Simplified
        const badgeCount = Math.floor((userData.problemsSolved || 0) / 5) + (userData.completedSkills?.length || 0); 
        const badgesValEl = document.getElementById('stats-badges-val');
        if (badgesValEl) badgesValEl.textContent = badgeCount;
        
        // 6. Detailed Progress (User Req #6)
        const timeSpentEl = document.getElementById('stats-time-val');
        const probSolvedEl = document.getElementById('stats-problems-val');
        
        if (timeSpentEl) {
            const hrs = Math.floor(userData.timeSpent / 60);
            const mins = userData.timeSpent % 60;
            timeSpentEl.textContent = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
        }
        if (probSolvedEl) probSolvedEl.textContent = userData.problemsSolved || 0;

        // 4. Current Roadmap Card
        const titleCardEl = document.getElementById('roadmap-title-card');
        const levelTagEl = document.getElementById('roadmap-level-tag');
        const fillBarEl = document.getElementById('roadmap-progress-bar-fill');
        const statusTextEl = document.getElementById('roadmap-status-text');

        if (currentPath) {
            const pathData = ROADMAP_DATA[currentPath];
            if (titleCardEl) titleCardEl.textContent = pathData.title;
            
            const level = totalProgressPct >= 80 ? 'Expert' : totalProgressPct >= 40 ? 'Intermediate' : 'Beginner';
            if (levelTagEl) levelTagEl.textContent = level;
            
            if (fillBarEl) fillBarEl.style.width = `${totalProgressPct}%`;
            if (statusTextEl) statusTextEl.textContent = totalProgressPct === 100 ? 'Course Mastered' : `${totalProgressPct}% Progress`;
        } else {
            if (titleCardEl) titleCardEl.textContent = 'Select a path to begin';
        }

        renderSkillProficiency();
        renderAchievementsCarousel();
    }

    function renderSkillProficiency() {
        const container = document.getElementById('proficiency-skills-list');
        if (!container) return;

        if (!currentPath || !userData.scores[currentPath]) {
            container.innerHTML = `<p class="text-sm text-[#5d605c]">Explore career paths and take assessments to build your proficiency profile.</p>`;
            return;
        }

        const pathData = ROADMAP_DATA[currentPath];
        const scores = userData.scores[currentPath];
        
        container.innerHTML = pathData.milestones.map((milestone, idx) => {
            const score = scores[idx] || 0;
            const level = score >= 80 ? 'Expert' : score >= 60 ? 'Advanced' : score >= 40 ? 'Intermediate' : 'Novice';
            return `
                <div class="space-y-2">
                    <div class="flex justify-between text-sm">
                        <span class="font-medium text-[#303330]">${milestone.title}</span>
                        <span class="text-[#3b6852] font-bold">${level}</span>
                    </div>
                    <div class="h-1.5 w-full bg-[#e1e3de] rounded-full">
                        <div class="h-full bg-[#3b6852] rounded-full transition-all duration-1000" style="width: ${score}%"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderAchievementsCarousel() {
        const carousel = document.getElementById('achievements-carousel');
        if (!carousel) return;

        const skills = userData.completedSkills || [];
        if (skills.length === 0) {
            carousel.innerHTML = `
                <div class="flex-shrink-0 w-48 bg-white p-6 rounded-[2rem] text-center shadow-sm border border-[#e1e3de]">
                    <div class="w-20 h-20 bg-[#f4f4f0] rounded-full mx-auto mb-4 flex items-center justify-center">
                        <span class="material-symbols-outlined text-3xl text-gray-400">workspace_premium</span>
                    </div>
                    <h5 class="font-bold text-sm text-[#303330]">Locked</h5>
                    <p class="text-[10px] text-[#5d605c] uppercase tracking-widest mt-1">First Achievement</p>
                </div>
            `;
            return;
        }

        carousel.innerHTML = skills.map(skill => `
            <div class="flex-shrink-0 w-48 bg-white p-6 rounded-[2rem] text-center shadow-sm border border-[#e1e3de] hover:border-[#3b6852]/30 transition-all">
                <div class="w-20 h-20 bg-[#bceed2] rounded-full mx-auto mb-4 flex items-center justify-center">
                    <span class="material-symbols-outlined text-3xl text-[#3b6852]" style="font-variation-settings: 'FILL' 1;">workspace_premium</span>
                </div>
                <h5 class="font-bold text-sm text-[#303330]">${skill}</h5>
                <p class="text-[10px] text-[#5d605c] uppercase tracking-widest mt-1">Skill Mastered</p>
            </div>
        `).join('');
    }

    // --- Helpers ---

    function setupEventListeners() {
        if (backBtn) {
            backBtn.onclick = () => {
                switchView('path-selection');
                window.scrollTo({ top: 0, behavior: 'smooth' });
            };
        }
        
        if (closeModal) {
            closeModal.onclick = () => {
                if (skillModal) skillModal.style.display = 'none';
            };
        }
        
        window.addEventListener('click', (event) => {
            if (skillModal && event.target === skillModal) {
                skillModal.style.display = 'none';
            }
        });

        const navBrand = document.getElementById('nav-brand');
        if (navBrand) {
            navBrand.onclick = () => {
                if (currentUser) {
                    switchView('path-selection');
                } else {
                    showHome();
                }
            };
        }

        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                renderPathSelection(e.target.value);
            });
        }

        if (getStartedBtn) {
            getStartedBtn.addEventListener('click', () => {
                showLogin();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        }

        // --- Auth State ---
        let isRegistering = false;

        // Helper: show inline auth error
        function showAuthError(msg, type = 'error') {
            const el = document.getElementById('auth-error-msg');
            if (el) { 
                el.textContent = msg; 
                el.style.display = 'block'; 
                if (type === 'success') {
                    el.style.color = '#15803d';
                    el.style.backgroundColor = 'rgba(34,197,94,0.12)';
                    el.style.borderColor = 'rgba(34,197,94,0.4)';
                } else {
                    el.style.color = '#ef4444';
                    el.style.backgroundColor = 'rgba(239,68,68,0.12)';
                    el.style.borderColor = 'rgba(239,68,68,0.4)';
                }
            }
        }
        function clearAuthError() {
            const el = document.getElementById('auth-error-msg');
            if (el) { el.textContent = ''; el.style.display = 'none'; }
        }

        // Helper: robust email validation
        function isValidEmail(email) {
            // Must have exactly one @, no consecutive dots, valid TLD of 2+ chars
            const re = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
            if (!re.test(email)) return false;
            const [local, domain] = email.split('@');
            if (local.startsWith('.') || local.endsWith('.')) return false;
            if (domain.startsWith('.') || domain.endsWith('.')) return false;
            if (local.includes('..') || domain.includes('..')) return false;
            const domainParts = domain.split('.');
            // TLD must be at least 2 chars and domain must have at least one label before TLD
            if (domainParts.length < 2) return false;
            const tld = domainParts[domainParts.length - 1];
            if (tld.length < 2) return false;
            return true;
        }

        // --- Auth Listeners ---
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            clearAuthError();
            const btn = loginForm.querySelector('.btn-primary');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Processing...';
            lucide.createIcons();
            
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;
            
            // Validate email format
            if (!isValidEmail(email)) {
                showAuthError('⚠️ Please enter a valid email address (e.g. user@gmail.com).');
                btn.innerHTML = originalText;
                return;
            }

            // Sign-up extra validations
            if (isRegistering) {
                const name = document.getElementById('fullname').value.trim();
                if (!name) {
                    showAuthError('⚠️ Please enter your full name.');
                    btn.innerHTML = originalText;
                    return;
                }
                if (password.length < 6) {
                    showAuthError('⚠️ Password must be at least 6 characters.');
                    btn.innerHTML = originalText;
                    return;
                }
            }

            try {
                if (isRegistering) {
                    await createUserWithEmailAndPassword(auth, email, password);
                } else {
                    await signInWithEmailAndPassword(auth, email, password);
                }
                clearAuthError();
            } catch (error) {
                let message = 'An error occurred. Please try again.';
                switch (error.code) {
                    case 'auth/user-not-found':
                    case 'auth/wrong-password':
                    case 'auth/invalid-credential':
                        message = '❌ Invalid email or password. Please check and try again.'; break;
                    case 'auth/invalid-email':
                        message = '⚠️ The email address is not valid.'; break;
                    case 'auth/email-already-in-use':
                        message = '⚠️ An account already exists with this email. Please sign in.'; break;
                    case 'auth/weak-password':
                        message = '⚠️ Password must be at least 6 characters.'; break;
                    case 'auth/too-many-requests':
                        message = '🔒 Too many failed attempts. Please wait and try again.'; break;
                    case 'auth/network-request-failed':
                        message = '🌐 Network error. Please check your connection.'; break;
                }
                showAuthError(message);
            } finally {
                btn.innerHTML = originalText;
            }
        });

        const forgotPasswordLink = document.getElementById('forgot-password');
        const fpModal = document.getElementById('forgot-password-modal');
        const closeFpModal = document.getElementById('close-fp-modal');
        const fpErrorMsg = document.getElementById('fp-error-msg');
        const fpSuccessMsg = document.getElementById('fp-success-msg');
        const fpStep1 = document.getElementById('fp-step-1');
        const fpStep2 = document.getElementById('fp-step-2');
        
        function showFPMessage(msg, type='error') {
            if (type === 'error') {
                fpErrorMsg.textContent = msg;
                fpErrorMsg.style.display = 'block';
                fpSuccessMsg.style.display = 'none';
            } else {
                fpSuccessMsg.textContent = msg;
                fpSuccessMsg.style.display = 'block';
                fpErrorMsg.style.display = 'none';
            }
        }

        if (forgotPasswordLink && fpModal) {
            forgotPasswordLink.addEventListener('click', (e) => {
                e.preventDefault();
                fpErrorMsg.style.display = 'none';
                fpSuccessMsg.style.display = 'none';
                fpStep1.style.display = 'block';
                fpStep2.style.display = 'none';
                fpModal.style.display = 'flex';
                
                const currentEmail = document.getElementById('email').value.trim();
                if (currentEmail) document.getElementById('fp-email').value = currentEmail;
            });

            closeFpModal.addEventListener('click', () => {
                fpModal.style.display = 'none';
            });

            document.getElementById('fp-send-otp-btn').addEventListener('click', async () => {
                const email = document.getElementById('fp-email').value.trim();
                if (!isValidEmail(email)) {
                    showFPMessage('⚠️ Please enter a valid email address.');
                    return;
                }
                const btn = document.getElementById('fp-send-otp-btn');
                const prevHtml = btn.innerHTML;
                btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Sending...';
                try {
                    const res = await fetch('http://localhost:8000/api/auth/otp/send', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email })
                    });
                    const data = await res.json();
                    if (data.success) {
                        showFPMessage('✅ OTP sent successfully. Please check your inbox.', 'success');
                        fpStep1.style.display = 'none';
                        fpStep2.style.display = 'block';
                    } else {
                        showFPMessage('❌ ' + (data.detail || 'Failed to send OTP.'));
                    }
                } catch (err) {
                    showFPMessage('❌ Network error. Make sure the Python backend is running.');
                } finally {
                    btn.innerHTML = prevHtml;
                }
            });

            document.getElementById('fp-reset-btn').addEventListener('click', async () => {
                const email = document.getElementById('fp-email').value.trim();
                const otp = document.getElementById('fp-otp').value.trim();
                const newPassword = document.getElementById('fp-new-password').value;
                const confirmPassword = document.getElementById('fp-confirm-password').value;

                if (otp.length !== 6) return showFPMessage('⚠️ OTP must be exactly 6 digits.');
                if (newPassword.length < 6) return showFPMessage('⚠️ Password must be at least 6 characters.');
                if (newPassword !== confirmPassword) return showFPMessage('⚠️ Passwords do not match.');

                const btn = document.getElementById('fp-reset-btn');
                const prevHtml = btn.innerHTML;
                btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Resetting...';
                
                try {
                    const res = await fetch('http://localhost:8000/api/auth/otp/reset', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email, otp, new_password: newPassword })
                    });
                    const data = await res.json();
                    if (data.success || res.ok) {
                        showFPMessage('✅ Password reset securely. You can now log in.', 'success');
                        setTimeout(() => {
                            fpModal.style.display = 'none';
                            document.getElementById('password').value = '';
                        }, 2500);
                    } else {
                        showFPMessage('❌ ' + (data.detail || 'Failed to reset password.'));
                    }
                } catch (err) {
                    showFPMessage('❌ Network error. Make sure the Python backend is running.');
                } finally {
                    btn.innerHTML = prevHtml;
                }
            });
        }

        googleLogin.addEventListener('click', async () => {
            clearAuthError();
            googleLogin.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Connecting...';
            lucide.createIcons();
            try {
                await signInWithPopup(auth, googleProvider);
            } catch (error) {
                showAuthError('Google sign-in failed. Please try again.');
                googleLogin.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/></svg> Continue with Google`;
            }
        });

        signOutBtn.addEventListener('click', async () => {
            await signOut(auth);
        });

        // --- Sidebar Listeners ---
        sidebarSignOutBtn.addEventListener('click', async () => {
            await signOut(auth);
        });

        navItems.forEach(item => {
            item.addEventListener('click', () => {
                const view = item.getAttribute('data-view');
                switchView(view);
            });
        });

        const toggleRegister = document.getElementById('toggle-register');
        const togglePrefix = document.getElementById('toggle-prefix');
        toggleRegister.addEventListener('click', (e) => {
            e.preventDefault();
            isRegistering = !isRegistering;
            clearAuthError();
            const header = loginView.querySelector('.login-header h2');
            const desc = loginView.querySelector('.login-header p');
            const submitBtn = loginForm.querySelector('.btn-primary');
            const nameGroup = document.getElementById('name-group');
            const nameInput = document.getElementById('fullname');
            
            if (isRegistering) {
                header.textContent = 'Create Account';
                desc.textContent = 'Join the career roadmap community';
                submitBtn.textContent = 'Sign Up';
                if (togglePrefix) togglePrefix.textContent = 'Already have an account? ';
                toggleRegister.textContent = 'Sign in';
                if (nameGroup) nameGroup.style.display = 'block';
                if (nameInput) nameInput.setAttribute('required', 'required');
            } else {
                header.textContent = 'Welcome Back';
                desc.textContent = 'Start your career journey with us';
                submitBtn.textContent = 'Sign In';
                if (togglePrefix) togglePrefix.textContent = "Don't have an account? ";
                toggleRegister.textContent = 'Create an account';
                if (nameGroup) nameGroup.style.display = 'none';
                if (nameInput) nameInput.removeAttribute('required');
            }
        });
    }

    function setupProfileEditListeners() {
        // New Design Listeners
        const signOutBtnNew = document.getElementById('sign-out-btn-new');
        if (signOutBtnNew) signOutBtnNew.onclick = () => signOut(auth);

        const openEditBtnNew = document.getElementById('open-edit-profile-btn-new');
        if (openEditBtnNew) {
            openEditBtnNew.onclick = () => {
                document.getElementById('edit-profile-name').value = userData.profile.name || '';
                document.getElementById('edit-profile-goal').value = userData.profile.goal || '';
                document.getElementById('profile-edit-modal').style.display = 'flex';
            };
        }

        const avatarWrapperNew = document.getElementById('profile-avatar-wrapper-new');
        const photoInputNew = document.getElementById('direct-profile-photo-new');
        if (avatarWrapperNew && photoInputNew) {
            avatarWrapperNew.onclick = () => photoInputNew.click();
            photoInputNew.onchange = async (e) => {
                if (!currentUser || e.target.files.length === 0) return;
                const file = e.target.files[0];
                const avatarIcon = avatarWrapperNew.querySelector('.material-symbols-outlined');
                if (avatarIcon) avatarIcon.textContent = 'sync'; // Show loading state
                
                try {
                    const storageRef = ref(storage, `profile_photos/${currentUser.uid}_${file.name}`);
                    await uploadBytes(storageRef, file);
                    const photoURL = await getDownloadURL(storageRef);
                    userData.profile = { ...userData.profile, photoURL };
                    await updateDoc(doc(db, 'users', currentUser.uid), { profile: userData.profile });
                    updateProfileUI();
                } catch (err) {
                    console.error(err);
                    alert("Upload failed");
                }
            };
        }

        const closeProfileModal = document.getElementById('close-profile-modal');
        if (closeProfileModal) {
            closeProfileModal.onclick = () => {
                document.getElementById('profile-edit-modal').style.display = 'none';
            };
        }

        document.getElementById('profile-edit-form').onsubmit = async (e) => {
            e.preventDefault();
            const name = document.getElementById('edit-profile-name').value;
            const goal = document.getElementById('edit-profile-goal').value;
            userData.profile = { ...userData.profile, name, goal };
            if (currentUser) {
                await updateDoc(doc(db, 'users', currentUser.uid), { profile: userData.profile });
            }
            updateProfileUI();
            document.getElementById('profile-edit-modal').style.display = 'none';
        };
    }

    function setupDiagnosticListeners() {
        document.getElementById('start-diag-btn').addEventListener('click', () => {
            document.getElementById('diag-intro-state').style.display = 'none';
            document.getElementById('diag-question-state').style.display = 'block';
            renderDiagQuestion();
        });

        document.getElementById('next-diag-btn').addEventListener('click', () => {
            activeDiagState.currentQ++;
            if (activeDiagState.currentQ < activeDiagState.questions.length) {
                renderDiagQuestion();
            } else {
                showDiagResults();
            }
        });

        document.getElementById('close-diag-modal').addEventListener('click', () => {
            document.getElementById('diagnostic-modal').style.display = 'none';
        });

        document.getElementById('generate-roadmap-btn').addEventListener('click', () => {
            document.getElementById('diagnostic-modal').style.display = 'none';
            if (activeDiagState.pathKey) showRoadmap(activeDiagState.pathKey);
        });

        document.getElementById('diagnostic-modal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('diagnostic-modal')) {
                document.getElementById('diagnostic-modal').style.display = 'none';
            }
        });
    }

    // =============================================
    // VIDEO PLAYER ENGINE
    // =============================================

    function initVideoPlayerListeners() {
        document.getElementById('player-back-btn').addEventListener('click', () => {
            if (ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo();
            clearInterval(antiSkipInterval);
            switchView('roadmap-container');
        });

        document.getElementById('start-video-quiz-btn').addEventListener('click', () => {
            const video = activePlaylist[currentVideoIndex];
            startVideoLessonQuiz(video);
        });

        // Error Fallback Listeners
        document.getElementById('watch-on-youtube-btn').addEventListener('click', () => {
            const video = activePlaylist[currentVideoIndex];
            if (video) {
                window.open(`https://www.youtube.com/watch?v=${video.youtubeId}`, '_blank');
            }
        });

        document.getElementById('error-skip-to-quiz').addEventListener('click', () => {
            const video = activePlaylist[currentVideoIndex];
            document.getElementById('video-error-overlay').style.display = 'none';
            if (video) {
                startVideoLessonQuiz(video);
            }
        });
    }

    function openCoursePlayer(pathKey) {
        currentPath = pathKey;
        activePlaylist = PLAYLIST_DATA[pathKey] || [];
        if (activePlaylist.length === 0) return;

        document.getElementById('player-course-title').textContent = ROADMAP_DATA[pathKey].title;
        switchView('video-player-view');
        
        // Find first unwatched video
        const progress = userData.videoProgress[pathKey] || { lastPassedIndex: -1 };
        currentVideoIndex = Math.min(progress.lastPassedIndex + 1, activePlaylist.length - 1);
        
        renderPlaylist();
        loadVideo(currentVideoIndex);
    }

    function renderPlaylist() {
        const container = document.getElementById('playlist-items');
        const badge = document.getElementById('player-progress-badge');
        container.innerHTML = '';

        const progress = userData.videoProgress[currentPath] || { lastPassedIndex: -1 };
        const completedCount = progress.lastPassedIndex + 1;
        badge.textContent = `${completedCount}/${activePlaylist.length} Watched`;

        activePlaylist.forEach((video, index) => {
            const isCompleted = index <= progress.lastPassedIndex;
            const isCurrent = index === currentVideoIndex;
            const isLocked = index > progress.lastPassedIndex + 1;

            const item = document.createElement('div');
            item.className = `playlist-item ${isCompleted ? 'completed' : ''} ${isCurrent ? 'active' : ''} ${isLocked ? 'locked' : ''}`;
            
            item.innerHTML = `
                <div class="item-index">${isCompleted ? '✓' : index + 1}</div>
                <div class="item-info">
                    <div class="item-title">${video.title}</div>
                    <div class="item-status">${isLocked ? 'Locked' : isCompleted ? 'Completed' : 'Current Lesson'}</div>
                </div>
                ${isLocked ? '<i data-lucide="lock" style="width:16px; opacity:0.5;"></i>' : ''}
            `;

            if (!isLocked) {
                item.onclick = () => {
                    currentVideoIndex = index;
                    renderPlaylist();
                    loadVideo(index);
                };
            }
            container.appendChild(item);
        });
        lucide.createIcons();
    }

        const video = activePlaylist[index];
        document.getElementById('current-video-title').textContent = video.title;
        document.getElementById('video-quiz-overlay').style.display = 'none';
        document.getElementById('video-error-overlay').style.display = 'none';
        
        // Ensure player is visible
        const playerEl = document.getElementById('youtube-player');
        if (playerEl) playerEl.style.visibility = 'visible';
        
        maxTimeWatched = 0;
        clearInterval(antiSkipInterval);

        if (!ytPlayer) {
            ytPlayer = new YT.Player('youtube-player', {
                height: '100%',
                width: '100%',
                videoId: video.youtubeId,
                playerVars: { 
                    'autoplay': 1, 
                    'controls': 1,
                    'rel': 0,
                    'modestbranding': 1, 
                    'iv_load_policy': 3,
                    'enablejsapi': 1,
                    'origin': window.location.origin
                },
                events: {
                    'onStateChange': onPlayerStateChange,
                    'onReady': (e) => {
                        e.target.setPlaybackRate(1);
                        startAntiSkipMonitor();
                    },
                    'onPlaybackRateChange': onPlaybackRateChange,
                    'onError': (e) => {
                        console.error("YouTube Player Error:", e.data);
                        // 101 or 150 = Embedding restricted
                        if (e.data === 101 || e.data === 150) {
                            document.getElementById('video-error-overlay').style.display = 'flex';
                            const playerEl = document.getElementById('youtube-player');
                            if (playerEl) playerEl.style.visibility = 'hidden';
                        } else {
                            alert("This video might be unavailable. We recommend searching the title on YouTube directly or trying the next lesson.");
                        }
                    }
                }
            });
        } else {
            ytPlayer.loadVideoById({
                videoId: video.youtubeId,
                origin: window.location.origin
            });
            ytPlayer.setPlaybackRate(1);
            startAntiSkipMonitor();
        }
    }

    function onPlaybackRateChange(event) {
        const rate = event.data;
        if (rate > 1.25) {
            // Enforce max speed — reset to 1.25x
            ytPlayer.setPlaybackRate(1.25);
            showSpeedWarning();
        }
    }

    function showSpeedWarning() {
        let toast = document.getElementById('speed-warning-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'speed-warning-toast';
            toast.style.cssText = `
                position: fixed;
                bottom: 80px;
                left: 50%;
                transform: translateX(-50%);
                background: linear-gradient(135deg, #7c2d12, #991b1b);
                color: white;
                padding: 14px 28px;
                border-radius: 50px;
                font-size: 14px;
                font-weight: 600;
                z-index: 99999;
                display: none;
                box-shadow: 0 8px 32px rgba(0,0,0,0.4);
                border: 1px solid rgba(255,255,255,0.15);
                white-space: nowrap;
                animation: slideUpToast 0.3s ease-out;
            `;
            document.head.insertAdjacentHTML('beforeend', `
                <style>
                    @keyframes slideUpToast {
                        from { bottom: 50px; opacity: 0; }
                        to { bottom: 80px; opacity: 1; }
                    }
                </style>
            `);
            document.body.appendChild(toast);
        }
        toast.innerHTML = '🚫 Speed limited to 1.25x — please watch attentively!';
        toast.style.display = 'block';
        clearTimeout(toast._hideTimer);
        toast._hideTimer = setTimeout(() => toast.style.display = 'none', 3500);
    }

    function onPlayerStateChange(event) {
        if (event.data === YT.PlayerState.ENDED) {
            document.getElementById('video-quiz-overlay').style.display = 'flex';
            clearInterval(antiSkipInterval);
        }
    }

    function startAntiSkipMonitor() {
        antiSkipInterval = setInterval(() => {
            if (ytPlayer && ytPlayer.getCurrentTime) {
                // Anti-skip: prevent seeking forward
                const currentTime = ytPlayer.getCurrentTime();
                if (currentTime > maxTimeWatched + 2) {
                    ytPlayer.seekTo(maxTimeWatched);
                } else {
                    maxTimeWatched = Math.max(maxTimeWatched, currentTime);
                }
                // Speed enforcement safety net: clamp to max 1.25x
                if (ytPlayer.getPlaybackRate && ytPlayer.getPlaybackRate() > 1.25) {
                    ytPlayer.setPlaybackRate(1.25);
                    showSpeedWarning();
                }
            }
        }, 1000);
    }

    // =============================================
    // VIDEO QUIZ & RESTRICTIONS
    // =============================================

    function setupAntiCopyRestrictions() {
        const blockAction = (e) => {
            if (isQuizActive) {
                e.preventDefault();
                showAntiCopyWarning();
            }
        };

        document.addEventListener('copy', blockAction);
        document.addEventListener('paste', blockAction);
        document.addEventListener('contextmenu', blockAction);
        document.addEventListener('keydown', (e) => {
            if (isQuizActive && (e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'v')) {
                e.preventDefault();
                showAntiCopyWarning();
            }
        });
    }

    function showAntiCopyWarning() {
        let badge = document.querySelector('.anti-copy-badge');
        if (!badge) {
            badge = document.createElement('div');
            badge.className = 'anti-copy-badge';
            badge.textContent = '🔒 Copy/Paste Restricted During Test';
            document.body.appendChild(badge);
        }
        badge.style.display = 'block';
        setTimeout(() => badge.style.display = 'none', 3000);
    }

    function startVideoLessonQuiz(video) {
        isQuizActive = true;
        
        activeTestState = { 
            pathKey: currentPath, 
            milestoneIndex: currentVideoIndex, 
            questions: video.quiz || [], 
            currentQ: 0, 
            score: 0, 
            selectedOpt: null,
            isLessonQuiz: true,
            testType: video.testType || 'quiz',
            task: video.task || ''
        };

        document.getElementById('test-modal-title').textContent = `Lesson Assessment: ${video.title}`;
        document.getElementById('test-intro-desc').textContent = "Complete this challenge to unlock the next lesson.";
        
        // Render appropriate view based on test type
        renderTestView();

        document.getElementById('test-intro-state').style.display = 'block';
        document.getElementById('test-question-state').style.display = 'none';
        document.getElementById('test-coding-state').style.display = 'none';
        document.getElementById('test-html-state').style.display = 'none';
        document.getElementById('test-data-state').style.display = 'none';
        document.getElementById('test-result-state').style.display = 'none';
        document.getElementById('module-test-modal').style.display = 'flex';
        
        document.getElementById('video-quiz-overlay').style.display = 'none';
        lucide.createIcons();
    }

    function renderTestView() {
        // Reset sub-views
        const states = ['test-question-state', 'test-coding-state', 'test-html-state', 'test-data-state'];
        states.forEach(s => document.getElementById(s).style.display = 'none');

        const { testType, task, questions } = activeTestState;

        if (testType === 'quiz') {
            document.getElementById('test-q-count').textContent = questions.length;
        } else if (testType === 'coding-challenge') {
            document.getElementById('coding-task-desc').textContent = task;
            document.getElementById('coding-textarea').value = '';
        } else if (testType === 'html-lab') {
            document.getElementById('html-task-desc').textContent = task;
            document.getElementById('html-lab-textarea').value = '<!-- Write HTML here -->\n<div class="card">\n  \n</div>';
            updateHtmlPreview();
        } else if (testType === 'data-lab') {
            document.getElementById('data-task-desc').textContent = task;
            document.getElementById('data-task-display').innerHTML = '<p>Dataset: [Sample Data View]</p><table style="width:100%; border-collapse:collapse; font-size:12px;"><tr><th>ID</th><th>Value</th></tr><tr><td>1</td><td>100</td></tr><tr><td>2</td><td>200</td></tr></table>';
        }
    }

    // Initialize listeners for specialized tests
    document.getElementById('start-test-btn').onclick = () => {
        document.getElementById('test-intro-state').style.display = 'none';
        const type = activeTestState.testType;
        if (type === 'quiz') {
            document.getElementById('test-question-state').style.display = 'block';
            renderTestQuestion();
        } else if (type === 'coding-challenge') {
            document.getElementById('test-coding-state').style.display = 'block';
        } else if (type === 'html-lab') {
            document.getElementById('test-html-state').style.display = 'block';
        } else if (type === 'data-lab') {
            document.getElementById('test-data-state').style.display = 'block';
        }
    };

    // HTML Lab Preview Engine
    const htmlTextArea = document.getElementById('html-lab-textarea');
    htmlTextArea.addEventListener('input', updateHtmlPreview);

    function updateHtmlPreview() {
        const previewFrame = document.getElementById('html-lab-preview');
        const content = htmlTextArea.value;
        const frameDoc = previewFrame.contentDocument || previewFrame.contentWindow.document;
        frameDoc.open();
        frameDoc.write(`
            <style>
                body { font-family: sans-serif; padding: 20px; }
                .card { padding: 20px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border: 1px solid #ddd; }
            </style>
            ${content}
        `);
        frameDoc.close();
    }

    // Submission Handlers
    document.getElementById('submit-code-btn').onclick = () => validateSpecialTest('coding');
    document.getElementById('submit-html-btn').onclick = () => validateSpecialTest('html');
    document.getElementById('submit-data-btn').onclick = () => validateSpecialTest('data');

    async function validateSpecialTest(type) {
        let passed = false;
        if (type === 'coding') {
            const code = document.getElementById('coding-textarea').value;
            // Simple validation: check if code is not empty and has basic structure
            if (code.length > 20) passed = true;
        } else if (type === 'html') {
            const html = document.getElementById('html-lab-textarea').value;
            if (html.includes('<div') || html.includes('<p')) passed = true;
        } else if (type === 'data') {
            const input = document.getElementById('data-lab-input').value;
            if (input.length > 5) passed = true;
        }

        if (passed) {
            userData.problemsSolved = (userData.problemsSolved || 0) + 1;
            activeTestState.score = activeTestState.questions.length || 1;
            
            if (currentUser) {
                updateDoc(doc(db, 'users', currentUser.uid), { problemsSolved: userData.problemsSolved });
            }
            
            showTestResults();
        } else {
            alert("Your solution is incomplete or incorrect. Please try again!");
        }
    }

    // Override the "Apply Schedule" button logic to handle lesson completion
    const originalApplyBtn = document.getElementById('apply-schedule-btn');
    const newApplyBtn = originalApplyBtn.cloneNode(true);
    originalApplyBtn.parentNode.replaceChild(newApplyBtn, originalApplyBtn);

    newApplyBtn.addEventListener('click', async () => {
        if (activeTestState.isLessonQuiz) {
            const pct = Math.round((activeTestState.score / activeTestState.questions.length) * 100);
            
            if (pct >= 80) {
                // Unlock logic
                const progress = userData.videoProgress[currentPath] || { lastPassedIndex: -1 };
                if (currentVideoIndex > (progress.lastPassedIndex || -1)) {
                    progress.lastPassedIndex = currentVideoIndex;
                    userData.videoProgress[currentPath] = progress;
                    userData.problemsSolved = (userData.problemsSolved || 0) + 1;
                    
                    if (currentUser) {
                        await updateDoc(doc(db, 'users', currentUser.uid), {
                            videoProgress: userData.videoProgress,
                            problemsSolved: userData.problemsSolved
                        });
                    }
                }
                
                document.getElementById('module-test-modal').style.display = 'none';
                isQuizActive = false;
                renderPlaylist(); // Update locked/completed icons
                
                // Move to next video if available
                if (currentVideoIndex < activePlaylist.length - 1) {
                    currentVideoIndex++;
                    renderPlaylist();
                    loadVideo(currentVideoIndex);
                } else {
                    alert("Congratulations! You've completed all videos in this course!");
                    switchView('roadmap-container');
                }
            } else {
                document.getElementById('module-test-modal').style.display = 'none';
                isQuizActive = false;
                alert("You need at least 80% to pass. Please re-watch the video and try again!");
            }
        } else {
            // Original Roadmap Logic
            document.getElementById('module-test-modal').style.display = 'none';
            if (currentPath) showRoadmap(currentPath);
        }
    });

    // Export for YouTube API (needed since this is a module)
    window.onYouTubeIframeAPIReady = () => {
        console.log("YouTube IFrame API Ready");
        // We can pre-initialize if needed, but loadVideo handles it lazily
    };

    // Export for empty state visibility
    window.app.showHome = () => switchView('path-selection');

    // Start
    init();
});
