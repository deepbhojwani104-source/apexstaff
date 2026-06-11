/* ==========================================================================
   AURASTAFF: CORE APP CONTROL CONTROLLER
   ========================================================================== */

document.addEventListener("DOMContentLoaded", function() {
    // Shorthand query helper
    const $ = selector => document.querySelector(selector);
    const $$ = selector => document.querySelectorAll(selector);

    let authListenerInitialized = false;
    let inactivityTimeout = null;
    const INACTIVITY_TIME = 5 * 60 * 1000; // 5 minutes in milliseconds

    function resetInactivityTimer() {
        if (inactivityTimeout) {
            clearTimeout(inactivityTimeout);
        }
        if (AuraStore.isLoggedIn()) {
            inactivityTimeout = setTimeout(handleInactivityLogout, INACTIVITY_TIME);
        }
    }

    function handleInactivityLogout() {
        AuraStore.logout();
        AuraDOM.showToast("You have been logged out due to inactivity.", "warning");
        setTimeout(() => {
            window.location.reload();
        }, 1000);
    }

    function startInactivityTracker() {
        const events = ["mousemove", "mousedown", "keypress", "scroll", "touchstart", "click"];
        events.forEach(evt => {
            document.addEventListener(evt, resetInactivityTimer, true);
        });
        resetInactivityTimer();
    }

    // Initial state loading
    AuraStore.loadState();
    startInactivityTracker();

    if (AuraStore.useFirebase) {
        initFirebaseObserver();
    } else {
        checkAuth();
    }

    // ==========================================================================
    // 1. Session Auth Logic & Initialization
    // ==========================================================================

    AuraStore.applyTenantUI = function(config) {
        if (!config) return;
        
        // 1. Set logo images
        if (config.logo) {
            document.querySelectorAll('.brand-logo-img').forEach(img => {
                img.src = config.logo;
            });
        }
        
        // 2. Set branding text
        if (config.name) {
            const parts = config.name.split(" ");
            const first = parts[0];
            const rest = parts.slice(1).join(" ") || "Staff";
            const html = `${first}<span>${rest}</span>`;
            document.querySelectorAll('.logo-box h2, .sidebar-brand h2').forEach(el => {
                el.innerHTML = html;
            });
            
            // Update page title
            document.title = `${config.name} - Management Portal`;
        }
        
        // 3. Set theme color
        if (config.theme) {
            const hex = config.theme;
            document.documentElement.style.setProperty('--color-primary', hex);
            document.documentElement.style.setProperty('--color-primary-hover', hex);
            
            // Convert to rgb for transparency support in css
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
                document.documentElement.style.setProperty('--color-primary-rgb', `${r}, ${g}, ${b}`);
            }
        }
    };

    AuraStore.resetTenantUI = function() {
        // Revert logos to default
        document.querySelectorAll('.brand-logo-img').forEach(img => {
            img.src = "icons/logo.jpg";
        });
        
        // Revert text to default
        document.querySelectorAll('.logo-box h2, .sidebar-brand h2').forEach(el => {
            el.innerHTML = `Smart <span>Office</span>`;
        });
        
        // Revert page title
        document.title = "Smart Office - Management Portal";
        
        // Revert theme colors
        document.documentElement.style.setProperty('--color-primary', '#6366f1');
        document.documentElement.style.setProperty('--color-primary-hover', '#4f46e5');
        document.documentElement.style.setProperty('--color-primary-rgb', '99, 102, 241');
    };

    function initFirebaseObserver() {
        if (authListenerInitialized) return;
        if (!AuraStore.useFirebase || typeof firebase === "undefined" || !firebase.auth) return;
        
        authListenerInitialized = true;
        
        // Show a loader during initial auth state resolution
        const body = document.body;
        const loader = document.createElement("div");
        loader.id = "app-startup-loader";
        loader.style = "position:fixed; top:0; left:0; width:100%; height:100%; background:var(--bg-app); display:flex; align-items:center; justify-content:center; z-index:99999; flex-direction:column; gap:16px; color:var(--text-primary);";
        loader.innerHTML = `
            <span class="material-symbols-outlined animated-spin" style="font-size: 48px; color: var(--color-primary);">sync</span>
            <span style="font-size:14px; font-weight:600; font-family:'Plus Jakarta Sans',sans-serif;">Loading system environment...</span>
        `;
        body.appendChild(loader);

        firebase.auth().onAuthStateChanged(async (user) => {
            const loaderEl = document.getElementById("app-startup-loader");
            updateSyncStatusIndicator();
            
            if (user) {
                try {
                    // Fetch user profile from /users/{email} or /users/{uid}
                    const profile = await AuraStore.fetchUserProfile(user);
                    if (profile) {
                        let tenantId = profile.tenant_id || profile.tenantId;
                        const role = profile.role || "staff";
                        
                        // Force samyak email to map to samyak tenant
                        if (user.email && user.email.toLowerCase().trim() === "admin@samyak.com") {
                            tenantId = "samyak";
                            profile.tenant_id = "samyak";
                            profile.tenantId = "samyak";
                        }
                        
                        // Prevent data carryover between different tenants
                        const lastTenantId = localStorage.getItem("aurastaff_last_tenant_id");
                        if (lastTenantId && lastTenantId !== tenantId) {
                            console.log(`Switching tenants from ${lastTenantId} to ${tenantId}. Clearing local cache.`);
                            AuraStore.clearLocalState();
                        }
                        localStorage.setItem("aurastaff_last_tenant_id", tenantId);
                        
                        AuraStore.currentTenantId = tenantId;
                        sessionStorage.setItem("aurastaff_logged_in", "true");
                        sessionStorage.setItem("aurastaff_user_role", role);
                        
                        if (role === "superadmin") {
                            AuraStore.currentTenantId = null;
                            AuraStore.resetTenantUI();
                            
                            $("#login-container").classList.add("hide");
                            $("#app-container").classList.add("hide");
                            $("#superadmin-container").classList.remove("hide");
                            
                            const errorBlock = $("#login-error");
                            if (errorBlock) errorBlock.classList.add("hide");
                            
                            initSuperAdmin();
                            resetInactivityTimer();
                            if (loaderEl) loaderEl.remove();
                            return;
                        }
                        
                        // Fetch tenant branding config
                        const config = await AuraStore.fetchTenantConfig(tenantId);
                        
                        // Check if tenant is deactivated
                        if (config && config.active === false) {
                            alert("Something went wrong. contact to administrator ");
                            await firebase.auth().signOut();
                            AuraStore.resetTenantUI();
                            sessionStorage.removeItem("aurastaff_logged_in");
                            sessionStorage.removeItem("aurastaff_user_role");
                            AuraStore.currentTenantId = null;
                            AuraStore.stopFirebaseListeners();
                            
                            $("#login-container").classList.remove("hide");
                            $("#app-container").classList.add("hide");
                            
                            const btn = $("#login-form button[type='submit']");
                            if (btn) {
                                btn.disabled = false;
                                btn.innerHTML = `<span>Sign In</span> <span class="material-symbols-outlined">arrow_forward</span>`;
                            }
                            if (loaderEl) loaderEl.remove();
                            return;
                        }
                        
                        if (config) {
                            // Apply custom tenant branding and theme
                            AuraStore.applyTenantUI(config);
                        } else {
                            AuraStore.resetTenantUI();
                        }
                        
                        // Start real-time Firestore listeners for this tenant
                        AuraStore.startFirebaseListeners();
                        
                        // Setup dynamic sidebar details
                        const roleName = role === "admin" ? "Administrator" : role === "faculty" ? "Faculty" : "Staff Clerk";
                        AuraStore.logActivity(`Authenticated via Firebase Auth: ${user.email} (${roleName}).`, "success");
                        
                        // Hide login card, show app dashboard
                        $("#login-container").classList.add("hide");
                        $("#app-container").classList.remove("hide");
                        
                        const errorBlock = $("#login-error");
                        if (errorBlock) errorBlock.classList.add("hide");
                        
                        initApp();
                        resetInactivityTimer();
                    } else {
                        console.error("Firestore user profile document not found for user:", user.email);
                        const errorBlock = $("#login-error");
                        if (errorBlock) {
                            errorBlock.querySelector(".error-msg").innerHTML = `Profile configuration not found in Firestore root <code>/users</code> collection for <b>${user.email}</b>.`;
                            errorBlock.classList.remove("hide");
                        }
                        AuraDOM.showToast("Authentication Error: User profile configuration not found.", "error");
                        firebase.auth().signOut();
                    }
                } catch (err) {
                    console.error("Error loading user profile:", err);
                    const errorBlock = $("#login-error");
                    if (errorBlock) {
                        errorBlock.querySelector(".error-msg").textContent = `Firestore Error: ${err.message || "Failed to retrieve user tenant profile."}`;
                        errorBlock.classList.remove("hide");
                    }
                    AuraDOM.showToast("Authentication Error: Failed to retrieve user tenant profile.", "error");
                    firebase.auth().signOut();
                }
            } else {
                sessionStorage.removeItem("aurastaff_logged_in");
                sessionStorage.removeItem("aurastaff_user_role");
                AuraStore.currentTenantId = null;
                AuraStore.stopFirebaseListeners();
                AuraStore.resetTenantUI();
                
                $("#login-container").classList.remove("hide");
                $("#app-container").classList.add("hide");
                if (inactivityTimeout) {
                    clearTimeout(inactivityTimeout);
                    inactivityTimeout = null;
                }
            }

            // Remove startup loader once state is resolved
            if (loaderEl) {
                loaderEl.remove();
            }
        });
    }

    function checkAuth() {
        const hasFirebaseConfig = localStorage.getItem("aurastaff_firebase_config") !== null;
        if (!hasFirebaseConfig) {
            $("#firebase-setup-container").classList.remove("hide");
            $("#login-container").classList.add("hide");
            $("#app-container").classList.add("hide");
            $("#superadmin-container").classList.add("hide");
            initFirebaseSetupForm();
            return;
        }

        $("#firebase-setup-container").classList.add("hide");
        
        updateSyncStatusIndicator();

        if (AuraStore.useFirebase) {
            return; // Managed by onAuthStateChanged
        }

        if (AuraStore.isLoggedIn()) {
            const role = AuraStore.getUserRole();
            if (role === "superadmin") {
                $("#login-container").classList.add("hide");
                $("#app-container").classList.add("hide");
                $("#superadmin-container").classList.remove("hide");
                initSuperAdmin();
                resetInactivityTimer();
                return;
            }
            $("#login-container").classList.add("hide");
            $("#app-container").classList.remove("hide");
            $("#superadmin-container").classList.add("hide");
            initApp();
            resetInactivityTimer();
        } else {
            $("#login-container").classList.remove("hide");
            $("#app-container").classList.add("hide");
            $("#superadmin-container").classList.add("hide");
            if (inactivityTimeout) {
                clearTimeout(inactivityTimeout);
                inactivityTimeout = null;
            }
        }
    }

    // Login Form Submit handler
    $("#login-form").addEventListener("submit", async function(e) {
        e.preventDefault();
        const usernameOrEmail = $("#username").value.trim();
        const password = $("#password").value.trim();
        
        const errorBlock = $("#login-error");
        errorBlock.classList.add("hide");
        
        if (AuraStore.useFirebase && typeof firebase !== "undefined" && firebase.auth) {
            // Online Mode: Firebase Authentication
            const btn = $("#login-form button[type='submit']");
            try {
                btn.disabled = true;
                btn.innerHTML = `<span class="material-symbols-outlined animated-spin" style="font-size:16px; margin-right:6px;">sync</span><span>Verifying...</span>`;
                
                await firebase.auth().signInWithEmailAndPassword(usernameOrEmail, password);
                // Success is handled by onAuthStateChanged observer
            } catch (err) {
                console.error("Login authentication error:", err);
                btn.disabled = false;
                btn.innerHTML = `<span>Sign In</span> <span class="material-symbols-outlined">arrow_forward</span>`;
                
                errorBlock.querySelector(".error-msg").textContent = err.message || "Invalid credentials. Try again.";
                errorBlock.classList.remove("hide");
                errorBlock.classList.add("shake");
                setTimeout(() => errorBlock.classList.remove("shake"), 300);
            }
        } else {
            // Offline Mode: Custom passwords
            const success = AuraStore.login(usernameOrEmail, password);
            if (success) {
                checkAuth();
                const role = AuraStore.getUserRole();
                const roleName = role === "admin" ? "Administrator" : role === "faculty" ? "Faculty" : "Staff Clerk";
                AuraDOM.showToast(`Logged in successfully as ${roleName}`, "success");
            } else {
                errorBlock.querySelector(".error-msg").textContent = "Invalid username or password!";
                errorBlock.classList.remove("hide");
                errorBlock.classList.add("shake");
                setTimeout(() => errorBlock.classList.remove("shake"), 300);
            }
        }
    });

    // Password Visibility toggle
    $("#btn-toggle-password").addEventListener("click", function() {
        const passwordInput = $("#password");
        if (passwordInput.type === "password") {
            passwordInput.type = "text";
            this.textContent = "visibility";
        } else {
            passwordInput.type = "password";
            this.textContent = "visibility_off";
        }
    });

    // Change Firebase Config from login screen
    const resetFirebaseLoginBtn = $("#btn-reset-firebase-login");
    if (resetFirebaseLoginBtn) {
        resetFirebaseLoginBtn.addEventListener("click", function(e) {
            e.preventDefault();
            if (confirm("Reset Firebase configuration parameters? This will return you to the cloud setup screen.")) {
                localStorage.removeItem("aurastaff_firebase_config");
                localStorage.removeItem("aurastaff_firebase_migrated");
                AuraDOM.showToast("Firebase configuration cleared.", "warning");
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
            }
        });
    }

    // Logout Button handler
    $("#btn-logout").addEventListener("click", function() {
        AuraStore.logout();
        AuraDOM.showToast("Logged out of session", "info");
        setTimeout(() => {
            window.location.reload();
        }, 500);
    });

    // ==========================================================================
    // 2. SPA Navigation Control
    // ==========================================================================
    let currentView = "dashboard";
    const viewTitles = {
        dashboard: "Dashboard Overview",
        directory: "Staff Directory",
        attendance: "Faculty Attendance",
        payroll: "Payroll Hub",
        students: "Student Enrollment Hub",
        "student-attendance": "Student Attendance Register",
        inventory: "Inventory Hub",
        finance: "Profit & Loss Ledger",
        settings: "System Settings",
        reports: "Reports Hub"
    };

    function switchView(targetView) {
        const role = AuraStore.getUserRole();
        // Enforce user role authorization limits
        if (role === "faculty") {
            if (targetView !== "students" && targetView !== "student-attendance") {
                targetView = "student-attendance";
            }
        } else if ((targetView === "payroll" || targetView === "finance") && role !== "admin") {
            targetView = "dashboard";
        }

        currentView = targetView;
        
        // Hide all views, display the selected target view
        $$(".page-view").forEach(view => view.classList.add("hide"));
        const targetViewEl = $(`#view-${targetView}`);
        if (targetViewEl) targetViewEl.classList.remove("hide");

        // Toggle Sidebar menu states
        $$(".menu-item").forEach(item => {
            if (item.dataset.view === targetView) {
                item.classList.add("active");
            } else {
                item.classList.remove("active");
            }
        });

        // Set Top Header page title
        $("#page-title").textContent = viewTitles[targetView] || "System View";

        // Trigger individual view renderers
        renderViewData(targetView);
    }

    // Sidebar Menu Bindings
    $$(".menu-item").forEach(item => {
        item.addEventListener("click", function(e) {
            e.preventDefault();
            const targetView = this.dataset.view;
            switchView(targetView);
        });
    });

    // Main Renderer Router
    function renderViewData(viewName) {
        if (viewName === "dashboard") {
            AuraDOM.renderDashboard();
        } else if (viewName === "directory") {
            refreshDirectory();
        } else if (viewName === "attendance") {
            refreshAttendance();
        } else if (viewName === "payroll") {
            refreshPayroll();
        } else if (viewName === "students") {
            refreshStudents();
        } else if (viewName === "student-attendance") {
            refreshStudentAttendance();
        } else if (viewName === "inventory") {
            refreshInventory();
        } else if (viewName === "finance") {
            refreshFinance();
        } else if (viewName === "settings") {
            loadSettingsValues();
        } else if (viewName === "reports") {
            refreshReports();
        }
    }

    // Custom Event trigger for live audit logs update on dashboard
    document.addEventListener('activityLogged', function() {
        if (currentView === "dashboard") {
            AuraDOM.renderDashboard();
        }
    });

    // Custom Event trigger for remote Firebase collection updates
    document.addEventListener('firebaseDataChanged', function(e) {
        const view = e.detail.view;
        if (currentView === view || (currentView === "dashboard" && view === "dashboard") || view === "all") {
            renderViewData(currentView);
        }
        if (view === "settings") {
            applyRolePrivileges();
        }
        updateSyncStatusIndicator();
    });

    // ==========================================================================
    // 3. Theme Toggle Setup
    // ==========================================================================
    function initTheme() {
        const themeToggleBtn = $("#theme-toggle-btn");
        const currentTheme = localStorage.getItem("aurastaff_theme") || "light";
        
        document.documentElement.setAttribute("data-theme", currentTheme);
        
        themeToggleBtn.addEventListener("click", () => {
            const nowTheme = document.documentElement.getAttribute("data-theme");
            const newTheme = nowTheme === "dark" ? "light" : "dark";
            
            document.documentElement.setAttribute("data-theme", newTheme);
            localStorage.setItem("aurastaff_theme", newTheme);
            AuraStore.logActivity(`UI color theme toggled to ${newTheme} mode.`, "info");
        });
    }

    // ==========================================================================
    // 4. Staff Directory Panel Actions
    // ==========================================================================
    let directoryFilters = {
        search: "",
        department: "",
        status: "",
        viewMode: "grid"
    };

    function refreshDirectory() {
        directoryFilters.search = $("#search-staff").value;
        directoryFilters.department = $("#filter-dept").value;
        directoryFilters.status = $("#filter-status").value;
        AuraDOM.renderDirectory(directoryFilters);
    }

    // Filters triggers
    $("#search-staff").addEventListener("input", refreshDirectory);
    $("#filter-dept").addEventListener("change", refreshDirectory);
    $("#filter-status").addEventListener("change", refreshDirectory);

    $("#btn-clear-filters").addEventListener("click", () => {
        $("#search-staff").value = "";
        $("#filter-dept").value = "";
        $("#filter-status").value = "";
        refreshDirectory();
        AuraDOM.showToast("Filters reset", "info");
    });

    // View togglers
    $("#btn-view-grid").addEventListener("click", function() {
        this.classList.add("active");
        $("#btn-view-list").classList.remove("active");
        directoryFilters.viewMode = "grid";
        refreshDirectory();
    });

    $("#btn-view-list").addEventListener("click", function() {
        this.classList.add("active");
        $("#btn-view-grid").classList.remove("active");
        directoryFilters.viewMode = "list";
        refreshDirectory();
    });

    // ==========================================================================
    // 5. Staff Form Modal Handling (Add/Edit)
    // ==========================================================================
    
    // Quick Add Button clicks
    $("#btn-quick-add").addEventListener("click", openAddStaffModal);
    $("#tile-add-staff").addEventListener("click", openAddStaffModal);

    function openAddStaffModal() {
        $("#staff-entry-form").reset();
        $("#staff-edit-id").value = "";
        $("#staff-id-code").readOnly = false;
        $("#staff-id-code").placeholder = "e.g. APEX-101";
        $("#modal-staff-title").textContent = "Add New Staff Member";
        
        // Pre-fill joining date as today
        $("#staff-joining-date").value = new Date().toISOString().split('T')[0];
        
        if (AuraStore.getUserRole() !== "admin") {
            $("#staff-base-salary").value = 0;
            $("#staff-base-salary").removeAttribute("required");
        } else {
            $("#staff-base-salary").setAttribute("required", "required");
        }

        $("#modal-staff-form").classList.remove("hide");
    }

    // Modal Close Button Clicks
    $$(".btn-close-modal").forEach(btn => {
        btn.addEventListener("click", function() {
            // Close all modal overlays
            $$(".modal-overlay").forEach(modal => modal.classList.add("hide"));
        });
    });

    // Form submits: handles both ADD and EDIT based on ID field value
    $("#staff-entry-form").addEventListener("submit", function(e) {
        e.preventDefault();
        
        const id = $("#staff-edit-id").value.trim();
        const baseSalary = Number($("#staff-base-salary").value);
        
        const staffObj = {
            name: $("#staff-name").value.trim(),
            email: $("#staff-email").value.trim(),
            phone: $("#staff-phone").value.trim(),
            gender: $("#staff-gender").value,
            department: $("#staff-dept").value,
            designation: $("#staff-designation").value.trim(),
            joiningDate: $("#staff-joining-date").value,
            status: $("#staff-status").value,
            baseSalary: baseSalary,
            salaryType: $("#staff-salary-type").value,
            bankName: $("#staff-bank-name").value.trim(),
            bankAccount: $("#staff-bank-acc").value.trim(),
            bankIfsc: $("#staff-bank-ifsc").value.trim()
        };

        if (staffObj.name === "" || staffObj.phone === "" || staffObj.joiningDate === "") {
            AuraDOM.showToast("Please fill all mandatory fields (Name, Phone, Joining Date).", "error");
            return;
        }

        const phoneRegex = /^[0-9]{10}$/;
        if (!phoneRegex.test(staffObj.phone)) {
            AuraDOM.showToast("Phone Number must be exactly 10 digits.", "error");
            return;
        }

        try {
            if (id === "") {
                // ADD MODE
                const customId = $("#staff-id-code").value.trim();
                if (customId !== "") {
                    staffObj.id = customId;
                }
                AuraStore.addStaff(staffObj);
                AuraDOM.showToast(`Successfully registered ${staffObj.name}`, "success");
            } else {
                // EDIT MODE
                AuraStore.updateStaff(id, staffObj);
                AuraDOM.showToast(`Updated profile details for ${staffObj.name}`, "success");
            }
            
            $("#modal-staff-form").classList.add("hide");
            
            // Re-calculate payroll values to reflect salary/status modifications
            const year = new Date($("#attendance-date-picker").value || new Date()).getFullYear();
            const month = new Date($("#attendance-date-picker").value || new Date()).getMonth();
            AuraStore.calculatePayrollForMonth(year, month);
            
            refreshDirectory();
            AuraDOM.renderDashboard();
        } catch (error) {
            AuraDOM.showToast(error.message, "error");
        }
    });

    // Directory dynamic row clicks (EDIT, PROFILE detail card)
    $("#staff-directory-grid").addEventListener("click", function(e) {
        const editBtn = e.target.closest(".btn-edit-staff");
        const profileBtn = e.target.closest(".btn-view-profile");
        const deleteBtn = e.target.closest(".btn-delete-staff");

        if (editBtn) {
            const staffId = editBtn.dataset.id;
            const emp = AuraStore.getStaffById(staffId);
            if (emp) {
                // Load details into Modal
                $("#staff-edit-id").value = emp.id;
                $("#staff-id-code").value = emp.id;
                $("#staff-id-code").readOnly = true; // Lock code on edit
                
                $("#staff-name").value = emp.name;
                $("#staff-email").value = emp.email;
                $("#staff-phone").value = emp.phone;
                $("#staff-gender").value = emp.gender || "Male";
                $("#staff-dept").value = emp.department;
                $("#staff-designation").value = emp.designation;
                $("#staff-joining-date").value = emp.joiningDate;
                $("#staff-status").value = emp.status;
                $("#staff-base-salary").value = emp.baseSalary;
                $("#staff-salary-type").value = emp.salaryType || "Standard";
                $("#staff-bank-name").value = emp.bankName || "";
                $("#staff-bank-acc").value = emp.bankAccount || "";
                $("#staff-bank-ifsc").value = emp.bankIfsc || "";

                if (AuraStore.getUserRole() !== "admin") {
                    $("#staff-base-salary").removeAttribute("required");
                } else {
                    $("#staff-base-salary").setAttribute("required", "required");
                }

                $("#modal-staff-title").textContent = `Edit Staff: ${emp.name}`;
                $("#modal-staff-form").classList.remove("hide");
            }
        }

        if (profileBtn) {
            const staffId = profileBtn.dataset.id;
            AuraDOM.renderStaffDetailModal(staffId);
            $("#modal-staff-detail").classList.remove("hide");
        }

        if (deleteBtn) {
            const staffId = deleteBtn.dataset.id;
            const emp = AuraStore.getStaffById(staffId);
            if (emp) {
                if (confirm(`Are you sure you want to delete staff member ${emp.name} (${staffId})?`)) {
                    try {
                        AuraStore.deleteStaff(staffId);
                        AuraDOM.showToast(`Deleted staff profile for ${emp.name}`, "info");
                        refreshDirectory();
                        AuraDOM.renderDashboard();
                    } catch (err) {
                        AuraDOM.showToast(err.message, "error");
                    }
                }
            }
        }
    });

    // ==========================================================================
    // 6. Daily Attendance Sheet Interactions
    // ==========================================================================
    let currentAttendanceDate = new Date().toISOString().split('T')[0];

    function initAttendanceView() {
        const picker = $("#attendance-date-picker");
        const todayStr = new Date().toISOString().split('T')[0];
        picker.setAttribute("max", todayStr);
        picker.value = currentAttendanceDate;
        
        // Populate header date
        $("#header-date").textContent = new Date(currentAttendanceDate).toLocaleDateString('en-GB', { 
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' 
        });

        AuraDOM.renderAttendanceTable(currentAttendanceDate);
    }

    function refreshAttendance() {
        AuraDOM.renderAttendanceTable(currentAttendanceDate);
    }

    // Date picker field triggers
    $("#attendance-date-picker").addEventListener("change", function() {
        const todayStr = new Date().toISOString().split('T')[0];
        if (this.value > todayStr) {
            AuraDOM.showToast("Cannot select a future date.", "warning");
            this.value = todayStr;
        }
        currentAttendanceDate = this.value;
        $("#header-date").textContent = new Date(currentAttendanceDate).toLocaleDateString('en-GB', { 
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' 
        });
        refreshAttendance();
    });

    // Prev Day Nav Clicks
    $("#btn-prev-day").addEventListener("click", () => {
        const d = new Date(currentAttendanceDate);
        d.setDate(d.getDate() - 1);
        currentAttendanceDate = d.toISOString().split('T')[0];
        $("#attendance-date-picker").value = currentAttendanceDate;
        $("#header-date").textContent = d.toLocaleDateString('en-GB', { 
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' 
        });
        refreshAttendance();
    });

    // Next Day Nav Clicks
    $("#btn-next-day").addEventListener("click", () => {
        const todayStr = new Date().toISOString().split('T')[0];
        if (currentAttendanceDate >= todayStr) {
            AuraDOM.showToast("Cannot navigate to future dates.", "warning");
            return;
        }
        const d = new Date(currentAttendanceDate);
        d.setDate(d.getDate() + 1);
        currentAttendanceDate = d.toISOString().split('T')[0];
        $("#attendance-date-picker").value = currentAttendanceDate;
        $("#header-date").textContent = d.toLocaleDateString('en-GB', { 
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' 
        });
        refreshAttendance();
    });

    // Jump Today Button Click
    $("#btn-jump-today").addEventListener("click", () => {
        currentAttendanceDate = new Date().toISOString().split('T')[0];
        $("#attendance-date-picker").value = currentAttendanceDate;
        $("#header-date").textContent = new Date().toLocaleDateString('en-GB', { 
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' 
        });
        refreshAttendance();
    });

    // Shortcut: Mark attendance today header button
    $("#btn-quick-attendance").addEventListener("click", () => {
        switchView("attendance");
        $("#btn-jump-today").click();
    });
    $("#tile-mark-attendance").addEventListener("click", () => {
        switchView("attendance");
    });

    // Mark All Active Staff Present Click
    $("#btn-mark-all-present").addEventListener("click", () => {
        $$("#attendance-table-body tr").forEach(tr => {
            const presentRadio = tr.querySelector('input[value="Present"]');
            if (presentRadio) {
                presentRadio.checked = true;
                
                // Pre-fill standard check in and check out times if empty
                const timeField = tr.querySelector(".table-input-time");
                if (timeField && timeField.value === "") {
                    timeField.value = "09:00";
                }
                const timeoutField = tr.querySelector(".table-input-timeout");
                if (timeoutField && timeoutField.value === "") {
                    timeoutField.value = "17:00";
                }
            }
        });
        AuraDOM.showToast("All active rows toggled to Present", "info");
    });

    // Save Attendance Form Submit
    $("#btn-save-attendance").addEventListener("click", () => {
        const records = {};
        const rows = $$("#attendance-table-body tr");
        let valid = true;

        rows.forEach(tr => {
            const staffId = tr.dataset.staffId;
            if (!staffId) return;

            const selectedRadio = tr.querySelector(`input[name="status-${staffId}"]:checked`);
            const status = selectedRadio ? selectedRadio.value : "Absent";
            const checkIn = tr.querySelector(".table-input-time").value;
            const checkOut = tr.querySelector(".table-input-timeout").value;
            const remarks = tr.querySelector(".table-input-comment").value.trim();

            records[staffId] = { status, checkIn, checkOut, remarks };
        });

        if (valid) {
            AuraStore.saveDailyAttendance(currentAttendanceDate, records);
            AuraDOM.showToast(`Daily log successfully updated for ${currentAttendanceDate}`, "success");
            AuraDOM.renderAttendanceTable(currentAttendanceDate);
            AuraDOM.renderDashboard();
        }
    });

    // ==========================================================================
    // 7. Payroll Hub Interactions
    // ==========================================================================
    let currentPayrollMonth = new Date().getMonth();
    let currentPayrollYear = new Date().getFullYear();

    function initPayrollView() {
        $("#payroll-month").value = currentPayrollMonth;
        $("#payroll-year").value = currentPayrollYear;
        
        // Also initialize payroll reports filters to matching current period
        const repMonth = $("#payroll-report-month");
        const repYear = $("#payroll-report-year");
        if (repMonth) repMonth.value = currentPayrollMonth;
        if (repYear) repYear.value = currentPayrollYear;
        
        // Auto process calculations on first view to ensure data exists
        AuraStore.calculatePayrollForMonth(currentPayrollYear, currentPayrollMonth);
        AuraDOM.renderPayrollTable(currentPayrollYear, currentPayrollMonth);
    }

    function refreshPayroll() {
        AuraDOM.renderPayrollTable(currentPayrollYear, currentPayrollMonth);
    }

    // Refresh calculations button click
    $("#btn-calculate-payroll").addEventListener("click", () => {
        currentPayrollMonth = Number($("#payroll-month").value);
        currentPayrollYear = Number($("#payroll-year").value);
        const calcType = $("#payroll-calc-type").value;
        
        const selectedCheckboxes = $$(".payroll-row-select:checked");
        if (selectedCheckboxes.length === 0) {
            AuraDOM.showToast("Please select at least one staff member to calculate.", "error");
            return;
        }
        const selectedIds = Array.from(selectedCheckboxes).map(cb => cb.dataset.id);
        
        AuraStore.calculatePayrollForMonth(currentPayrollYear, currentPayrollMonth, selectedIds, calcType);
        refreshPayroll();
        AuraDOM.showToast(`Payroll calculations refreshed for ${selectedIds.length} staff member(s).`, "success");
    });

    // Shortcut click from Dashboard tile
    $("#tile-payroll").addEventListener("click", () => {
        switchView("payroll");
    });

    // Bulk action approve all
    $("#btn-bulk-approve-payroll").addEventListener("click", () => {
        const selectedCheckboxes = $$(".payroll-row-select:checked");
        if (selectedCheckboxes.length === 0) {
            AuraDOM.showToast("Please select at least one staff member to approve.", "error");
            return;
        }
        const selectedIds = Array.from(selectedCheckboxes).map(cb => cb.dataset.id);

        if (confirm(`Are you sure you want to mark the selected (${selectedIds.length}) salary payouts as PAID for this month?`)) {
            AuraStore.approveAllPayroll(currentPayrollYear, currentPayrollMonth, selectedIds);
            refreshPayroll();
            AuraDOM.showToast("Selected payroll registers finalized as Paid.", "success");
        }
    });

    // Select All and Row Selection Checkboxes logic using Event Delegation
    document.addEventListener("change", function(e) {
        if (e.target && e.target.id === "payroll-select-all") {
            const checked = e.target.checked;
            $$(".payroll-row-select").forEach(cb => {
                cb.checked = checked;
            });
        }
        
        if (e.target && e.target.classList.contains("payroll-row-select")) {
            const allCbs = $$(".payroll-row-select");
            const checkedCbs = $$(".payroll-row-select:checked");
            const selectAll = $("#payroll-select-all");
            if (selectAll) {
                selectAll.checked = (allCbs.length === checkedCbs.length);
            }
        }
    });

    // Payroll Table actions (Adjust allowances, view payslips)
    $("#payroll-table-body").addEventListener("click", function(e) {
        const adjustBtn = e.target.closest(".btn-adjust-payroll");
        const payslipBtn = e.target.closest(".btn-payslip-preview");

        if (adjustBtn) {
            const staffId = adjustBtn.dataset.id;
            const emp = AuraStore.getStaffById(staffId);
            const monthKey = `${currentPayrollYear}-${String(currentPayrollMonth + 1).padStart(2, '0')}`;
            const record = AuraStore.getState().payroll[monthKey]?.[staffId];

            if (emp && record) {
                // Populate adjustments form
                $("#adjust-staff-id").value = emp.id;
                $("#adjust-month").value = currentPayrollMonth;
                $("#adjust-year").value = currentPayrollYear;
                
                $("#adjust-avatar-icon").textContent = emp.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
                $("#adjust-staff-name").textContent = emp.name;
                $("#adjust-staff-role").textContent = emp.designation;
                $("#adjust-base-display").value = `₹${record.baseSalary.toLocaleString('en-IN')}`;
                
                $("#adjust-allowance").value = record.allowances;
                $("#adjust-deductions").value = record.deductions;
                $("#adjust-remarks").value = record.remarks || "";

                $("#modal-payroll-adjust").classList.remove("hide");
            }
        }

        if (payslipBtn) {
            const staffId = payslipBtn.dataset.id;
            AuraDOM.renderPayslipModal(staffId, currentPayrollYear, currentPayrollMonth);
            $("#modal-payslip-preview").classList.remove("hide");
        }
    });

    // Payroll Adjust Form Submit handler
    $("#payroll-adjust-form").addEventListener("submit", function(e) {
        e.preventDefault();
        const staffId = $("#adjust-staff-id").value;
        const month = Number($("#adjust-month").value);
        const year = Number($("#adjust-year").value);

        const adjustments = {
            allowances: Number($("#adjust-allowance").value) || 0,
            deductions: Number($("#adjust-deductions").value) || 0,
            remarks: $("#adjust-remarks").value.trim()
        };

        try {
            AuraStore.updatePayrollAdjustment(year, month, staffId, adjustments);
            $("#modal-payroll-adjust").classList.add("hide");
            refreshPayroll();
            AuraDOM.showToast("Salary modifications applied", "success");
        } catch (err) {
            AuraDOM.showToast(err.message, "error");
        }
    });

    // Print payslip button click
    $("#btn-print-payslip").addEventListener("click", () => {
        window.print();
    });

    // ==========================================================================
    // 7.5 Student Enrollment & Course Master Actions
    // ==========================================================================
    AuraStore.downloadExcelReport = function(filename, headers, rows) {
        let csvContent = "\uFEFF";
        csvContent += headers.map(h => `"${h.replace(/"/g, '""')}"`).join(",") + "\n";
        rows.forEach(row => {
            csvContent += row.map(val => {
                const str = (val === null || val === undefined) ? "" : String(val);
                return `"${str.replace(/"/g, '""')}"`;
            }).join(",") + "\n";
        });
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    let activeReportTab = "faculty";

    function refreshReports() {
        AuraDOM.renderReportsHub(activeReportTab);
    }

    function populateReportCoursesFilter() {
        const filterSelect = $("#student-report-course") || $("#report-filter-course");
        if (!filterSelect) return;
        
        const courses = AuraStore.getCourses();
        const currentValue = filterSelect.value;
        
        filterSelect.innerHTML = `<option value="all">All Courses</option>`;
        courses.forEach(c => {
            const opt = document.createElement("option");
            opt.value = c.name;
            opt.textContent = c.name;
            filterSelect.appendChild(opt);
        });
        
        // Restore value if still present
        if (courses.some(c => c.name === currentValue)) {
            filterSelect.value = currentValue;
        } else {
            filterSelect.value = "all";
        }
    }

    function updateDashboardReport() {
        const students = AuraStore.getStudents() || [];
        const searchQuery = ($("#report-search") ? $("#report-search").value : "").toLowerCase().trim();
        const selectedCourse = $("#report-filter-course") ? $("#report-filter-course").value : "all";
        const selectedDuesFilter = $("#report-filter-dues") ? $("#report-filter-dues").value : "all";
        const selectedDueDateStr = $("#report-filter-due-date") ? $("#report-filter-due-date").value : "";

        const filtered = students.filter(s => {
            // 1. Text Search name / ID
            if (searchQuery !== "") {
                const nameMatch = s.name ? s.name.toLowerCase().includes(searchQuery) : false;
                const idMatch = s.id ? s.id.toLowerCase().includes(searchQuery) : false;
                if (!nameMatch && !idMatch) return false;
            }

            // 2. Filter Course
            if (selectedCourse !== "all") {
                const coursesList = s.course ? s.course.split(", ") : [];
                if (!coursesList.includes(selectedCourse)) return false;
            }

            // 3. Filter Dues
            const dueAmt = Math.max(0, s.courseFee - s.amountReceived);
            if (selectedDuesFilter === "pending" && dueAmt === 0) return false;
            if (selectedDuesFilter === "paid" && dueAmt > 0) return false;

            // 4. Filter Due Date (on or before selected date)
            if (selectedDueDateStr !== "") {
                if (!s.dueDate) return false;
                const studentDate = new Date(s.dueDate).getTime();
                const filterDate = new Date(selectedDueDateStr).getTime();
                if (studentDate > filterDate) return false;
            }

            return true;
        });

        AuraDOM.renderDashboardReport(filtered);
    }

    function refreshStudents() {
        AuraDOM.renderStudentsView();
        populateReportCoursesFilter();
        updateDashboardReport();
    }

    function refreshStudentAttendance() {
        const dateInput = $("#student-attendance-date");
        if (!dateInput) return;
        const selectedDate = dateInput.value;
        if (!selectedDate) return;
        AuraDOM.renderStudentAttendance(selectedDate);
    }

    // Course Master Add/Update submit
    const courseForm = $("#course-master-form");
    if (courseForm) {
        courseForm.addEventListener("submit", function(e) {
            e.preventDefault();
            const name = $("#course-name-input").value.trim();
            const price = Number($("#course-price-input").value);

            if (name === "" || isNaN(price) || price < 0) {
                AuraDOM.showToast("Invalid course details.", "error");
                return;
            }

            AuraStore.addCourse({ name, price });
            AuraDOM.showToast(`Course ${name} saved successfully!`, "success");
            courseForm.reset();
            refreshStudents();
        });
    }

    // Course Master Delete click delegation
    const courseTableBody = $("#course-list-body");
    if (courseTableBody) {
        courseTableBody.addEventListener("click", function(e) {
            const deleteBtn = e.target.closest(".btn-delete-course");
            if (deleteBtn) {
                const name = deleteBtn.dataset.name;
                if (confirm(`Are you sure you want to remove the course "${name}"?`)) {
                    AuraStore.deleteCourse(name);
                    AuraDOM.showToast(`Course "${name}" deleted.`, "info");
                    refreshStudents();
                }
            }
        });
    }

    // Open Course Master Modal click
    const btnOpenCourse = $("#btn-open-course-master");
    if (btnOpenCourse) {
        btnOpenCourse.addEventListener("click", function() {
            $("#modal-course-master").classList.remove("hide");
        });
    }

    // Toggle student courses dropdown list visibility on click
    const selectBox = $("#student-courses-select-box");
    const dropdownList = $("#student-courses-dropdown-list");
    if (selectBox && dropdownList) {
        selectBox.addEventListener("click", function(e) {
            e.stopPropagation();
            dropdownList.classList.toggle("hide");
        });
        
        // Hide dropdown list when clicking anywhere else
        document.addEventListener("click", function(e) {
            if (!e.target.closest("#student-courses-dropdown-container")) {
                dropdownList.classList.add("hide");
            }
        });
    }

    // Helper to strictly restrict inputs to 10 digits and numeric characters only
    function restrictToTenDigits(selector) {
        const input = $(selector);
        if (input) {
            input.addEventListener("input", function() {
                this.value = this.value.replace(/[^0-9]/g, '').slice(0, 10);
            });
        }
    }
    restrictToTenDigits("#student-mobile");
    restrictToTenDigits("#student-parent-mobile");
    restrictToTenDigits("#staff-phone");
    restrictToTenDigits("#sa-mobile");

    // Auto-update dues pending on received input
    const receivedInput = $("#student-amount-received");
    if (receivedInput) {
        receivedInput.addEventListener("input", function() {
            const netFee = Number($("#student-net-fee").value) || 0;
            const received = Number(this.value) || 0;
            $("#student-due-amount").value = Math.max(0, netFee - received);
        });
    }

    // Auto-recalculate when discount inputs change
    const discountTypeEl = $("#student-discount-type");
    if (discountTypeEl) {
        discountTypeEl.addEventListener("change", function() {
            if (AuraDOM.recalculateTotalCourseFee) {
                AuraDOM.recalculateTotalCourseFee();
            }
        });
    }
    const discountValueEl = $("#student-discount-value");
    if (discountValueEl) {
        discountValueEl.addEventListener("input", function() {
            if (AuraDOM.recalculateTotalCourseFee) {
                AuraDOM.recalculateTotalCourseFee();
            }
        });
    }

    // Student Enrollment Submit form (Add or Edit)
    const studentForm = $("#student-enrollment-form");
    if (studentForm) {
        studentForm.addEventListener("submit", function(e) {
            e.preventDefault();
            const editId = $("#student-edit-id").value.trim();
            const name = $("#student-name").value.trim();
            const mobile = $("#student-mobile").value.trim();
            const parentMobile = $("#student-parent-mobile").value.trim();
            const branch = $("#student-branch").value;
            const originalFee = Number($("#student-course-fee").value) || 0;
            const discountType = $("#student-discount-type").value;
            const discountValue = Number($("#student-discount-value").value) || 0;
            const discountAmount = Number($("#student-discount-amount").value) || 0;
            const courseFee = Number($("#student-net-fee").value) || 0;
            const amountReceived = Number($("#student-amount-received").value);
            const dueAmount = Number($("#student-due-amount").value);
            const dueDate = $("#student-due-date").value;
            const enrollmentDate = $("#student-enrollment-date").value;
            const remarks = $("#student-remarks").value.trim();

            // Get selected courses
            const selectedCourses = [];
            document.querySelectorAll('input[name="student-course-cb"]:checked').forEach(cb => {
                selectedCourses.push(cb.value);
            });
            const course = selectedCourses.join(", ");

            // Get checked fee types
            const feeTypes = [];
            document.querySelectorAll('input[name="fee-type-cb"]:checked').forEach(cb => {
                feeTypes.push(cb.value);
            });

            if (name === "" || mobile === "" || parentMobile === "" || selectedCourses.length === 0 || !branch || isNaN(amountReceived) || amountReceived < 0 || !enrollmentDate) {
                AuraDOM.showToast("Please fill all mandatory fields, select courses, enrollment date, and parent contact.", "error");
                return;
            }

            const phoneRegex = /^[0-9]{10}$/;
            if (!phoneRegex.test(mobile)) {
                AuraDOM.showToast("Student Mobile No must be exactly 10 digits.", "error");
                return;
            }
            if (!phoneRegex.test(parentMobile)) {
                AuraDOM.showToast("Parent Mobile No must be exactly 10 digits.", "error");
                return;
            }

            if (feeTypes.length === 0) {
                AuraDOM.showToast("Please select at least one Fee Type.", "error");
                return;
            }

            const studentData = {
                name,
                mobile,
                parentMobile,
                course,
                branch,
                originalFee,
                discountType,
                discountValue,
                discountAmount,
                courseFee,
                amountReceived,
                dueAmount,
                dueDate,
                enrollmentDate,
                remarks,
                feeType: feeTypes
            };

            try {
                let savedStudent = null;
                if (editId === "") {
                    // ADD
                    savedStudent = AuraStore.addStudent(studentData);
                    AuraDOM.showToast(`Enrolled student ${name} successfully!`, "success");
                } else {
                    // EDIT
                    studentData.id = editId;
                    savedStudent = AuraStore.updateStudent(editId, studentData);
                    AuraDOM.showToast(`Updated student profile for ${name}`, "success");
                }
                clearStudentForm();
                refreshStudents();
                
                // Prompt printable receipt PDF immediately
                if (savedStudent) {
                    AuraDOM.printFeeReceipt(savedStudent);
                    
                    // Auto-send WhatsApp message to parent
                    const parentPhone = savedStudent.parentMobile || savedStudent.mobile || "";
                    if (parentPhone) {
                        const branding = AuraStore.getBranding();
                        const instName = branding.name || "Samyak Computer Classes";
                        const actionText = editId === "" ? "enrolled" : "updated profile";
                        const message = `Dear Parent, your child ${savedStudent.name} has been ${actionText} for ${savedStudent.course} at ${instName}. Course fee: ₹${savedStudent.courseFee}, Received: ₹${savedStudent.amountReceived}, Dues: ₹${savedStudent.dueAmount}. Regards, ${instName}`;
                        
                        let formattedPhone = parentPhone.replace(/\D/g, '');
                        if (formattedPhone.length === 10) {
                            formattedPhone = "91" + formattedPhone;
                        }
                        const whatsappUrl = `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(message)}`;
                        setTimeout(() => {
                            window.open(whatsappUrl, '_blank');
                        }, 1200);
                    }
                }
            } catch (err) {
                AuraDOM.showToast(err.message, "error");
            }
        });
    }

    // Clear student form button
    const clearStudentBtn = $("#btn-clear-student");
    if (clearStudentBtn) {
        clearStudentBtn.addEventListener("click", function() {
            clearStudentForm();
        });
    }

    function clearStudentForm() {
        if (studentForm) {
            studentForm.reset();
        }
        $("#student-edit-id").value = "";
        const parentMobileInput = $("#student-parent-mobile");
        if (parentMobileInput) parentMobileInput.value = "";
        document.querySelectorAll('input[name="fee-type-cb"]').forEach(cb => {
            cb.checked = false;
        });
        document.querySelectorAll('input[name="student-course-cb"]').forEach(cb => {
            cb.checked = false;
        });
        $("#student-course-fee").value = 0;
        $("#student-discount-type").value = "none";
        const discValEl = $("#student-discount-value");
        if (discValEl) {
            discValEl.value = 0;
            discValEl.disabled = true;
            discValEl.placeholder = "N/A";
        }
        $("#student-discount-amount").value = 0;
        $("#student-net-fee").value = 0;
        $("#student-due-amount").value = 0;
        const todayStr = new Date().toISOString().split('T')[0];
        $("#student-enrollment-date").value = todayStr;
        const textSpan = $("#selected-courses-text");
        if (textSpan) {
            textSpan.textContent = "Select Courses...";
            textSpan.style.color = "var(--text-secondary)";
        }
        $("#student-name").focus();
    }

    const studentListTable = $("#students-list-table");
    if (studentListTable) {
        studentListTable.addEventListener("click", function(e) {
            const editBtn = e.target.closest(".btn-edit-student");
            const deleteBtn = e.target.closest(".btn-delete-student");
            const printBtn = e.target.closest(".btn-print-receipt");

            if (printBtn) {
                const id = printBtn.dataset.id;
                const students = AuraStore.getStudents();
                const student = students.find(s => s.id === id);
                if (student) {
                    AuraDOM.printFeeReceipt(student);
                }
            }

            const msgBtn = e.target.closest(".btn-message-parent");
            if (msgBtn) {
                const id = msgBtn.dataset.id;
                const students = AuraStore.getStudents();
                const student = students.find(s => s.id === id);
                if (student) {
                    const parentMobile = student.parentMobile || student.mobile || "";
                    if (!parentMobile) {
                        AuraDOM.showToast("No parent or student mobile number available.", "error");
                        return;
                    }
                    const customText = prompt(`Enter the message/update to send to the parent of ${student.name}:`);
                    if (customText === null) return; // cancelled
                    if (customText.trim() === "") {
                        AuraDOM.showToast("Message content cannot be empty.", "error");
                        return;
                    }
                    const branding = AuraStore.getBranding();
                    const instName = branding.name || "Samyak Computer Classes";
                    const message = `Dear Parent, regarding your child ${student.name}: ${customText.trim()}. Regards, ${instName}`;
                    
                    let formattedPhone = parentMobile.replace(/\D/g, '');
                    if (formattedPhone.length === 10) {
                        formattedPhone = "91" + formattedPhone;
                    }
                    const whatsappUrl = `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(message)}`;
                    window.open(whatsappUrl, '_blank');
                    AuraStore.logActivity(`General WhatsApp message alert sent to parent of ${student.name}`, "info");
                }
            }

            const payBtn = e.target.closest(".btn-record-payment");
            if (payBtn) {
                const id = payBtn.dataset.id;
                const students = AuraStore.getStudents();
                const student = students.find(s => s.id === id);
                if (student) {
                    $("#payment-student-id").value = student.id;
                    $("#payment-student-name").value = student.name;
                    
                    const dueAmt = Math.max(0, Number(student.courseFee || 0) - Number(student.amountReceived || 0));
                    $("#payment-student-due").value = dueAmt;
                    $("#payment-amount").value = dueAmt; // Default to full due amount
                    $("#payment-amount").max = dueAmt;
                    $("#payment-date").value = new Date().toISOString().split('T')[0];
                    $("#payment-remarks").value = "";
                    
                    // Reset checkboxes
                    document.querySelectorAll('input[name="payment-fee-type-cb"]').forEach(cb => {
                        cb.checked = cb.value === "Due fee";
                    });
                    
                    $("#modal-record-payment").classList.remove("hide");
                }
            }

            if (editBtn) {
                const id = editBtn.dataset.id;
                const students = AuraStore.getStudents();
                const student = students.find(s => s.id === id);
                if (student) {
                    // Load values into form
                    $("#student-edit-id").value = student.id;
                    $("#student-name").value = student.name;
                    $("#student-mobile").value = student.mobile || "";
                    const parentMobileInput = $("#student-parent-mobile");
                    if (parentMobileInput) parentMobileInput.value = student.parentMobile || student.mobile || "";
                    $("#student-branch").value = student.branch;
                    const origFee = student.originalFee !== undefined ? student.originalFee : (student.courseFee || 0);
                    $("#student-course-fee").value = origFee;
                    const dType = student.discountType || "none";
                    $("#student-discount-type").value = dType;
                    const dValEl = $("#student-discount-value");
                    if (dValEl) {
                        dValEl.value = student.discountValue || 0;
                        dValEl.disabled = dType === "none";
                        dValEl.placeholder = dType === "none" ? "N/A" : (dType === "percent" ? "e.g. 10" : "e.g. 1000");
                    }
                    $("#student-discount-amount").value = student.discountAmount || 0;
                    $("#student-net-fee").value = student.courseFee || 0;
                    $("#student-amount-received").value = student.amountReceived;
                    $("#student-due-amount").value = student.dueAmount || 0;
                    $("#student-due-date").value = student.dueDate || "";
                    const enrollDateFallback = student.enrollmentDate || (student.lastUpdated ? new Date(student.lastUpdated).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
                    $("#student-enrollment-date").value = enrollDateFallback;
                    $("#student-remarks").value = student.remarks || "";

                    // Set course checkbox states
                    const selectedCourses = student.course ? student.course.split(", ") : [];
                    document.querySelectorAll('input[name="student-course-cb"]').forEach(cb => {
                        cb.checked = selectedCourses.includes(cb.value);
                    });

                    // Update dropdown display label
                    const textSpan = $("#selected-courses-text");
                    if (textSpan) {
                        textSpan.textContent = selectedCourses.length > 0 ? selectedCourses.join(", ") : "Select Courses...";
                        textSpan.style.color = selectedCourses.length > 0 ? "var(--text-primary)" : "var(--text-secondary)";
                    }

                    // Reset and set fee type cbs
                    document.querySelectorAll('input[name="fee-type-cb"]').forEach(cb => {
                        cb.checked = student.feeType ? student.feeType.includes(cb.value) : false;
                    });

                    $("#student-name").focus();
                    // Scroll to form smoothly
                    $("#student-enrollment-form").scrollIntoView({ behavior: 'smooth' });
                }
            }

            if (deleteBtn) {
                const id = deleteBtn.dataset.id;
                if (confirm(`Are you sure you want to delete student ${id}?`)) {
                    AuraStore.deleteStudent(id);
                    AuraDOM.showToast(`Deleted student enrollment ${id}`, "info");
                    refreshStudents();
                }
            }
        });
    }

    // ==========================================================================
    // 7b. Inventory Hub Actions
    // ==========================================================================
    const inventoryFilters = { search: "", category: "all" };
    function refreshInventory() {
        const searchEl = $("#inventory-search");
        const filterEl = $("#inventory-filter-category");
        inventoryFilters.search = searchEl ? searchEl.value : "";
        inventoryFilters.category = filterEl ? filterEl.value : "all";
        AuraDOM.renderInventoryView(inventoryFilters);
    }

    function calculateInventoryTotal() {
        const qty = Number($("#inventory-quantity").value || 0);
        const price = Number($("#inventory-price").value || 0);
        $("#inventory-total-amount").value = qty * price;
    }

    const qtyInput = $("#inventory-quantity");
    const priceInput = $("#inventory-price");
    if (qtyInput) qtyInput.addEventListener("input", calculateInventoryTotal);
    if (priceInput) priceInput.addEventListener("input", calculateInventoryTotal);

    // Save/Update inventory item
    const inventoryForm = $("#inventory-form");
    if (inventoryForm) {
        inventoryForm.addEventListener("submit", function(e) {
            e.preventDefault();
            
            const editId = $("#inventory-edit-id").value.trim();
            const name = $("#inventory-name").value.trim();
            const category = $("#inventory-category").value;
            const purchaseDate = $("#inventory-purchase-date").value;
            const quantity = Number($("#inventory-quantity").value);
            const price = Number($("#inventory-price").value);
            const totalAmount = quantity * price;
            const remarks = $("#inventory-remarks").value.trim();

            const itemObj = {
                name,
                category,
                purchaseDate,
                quantity,
                price,
                totalAmount,
                remarks
            };

            try {
                if (editId) {
                    AuraStore.updateInventoryItem(editId, itemObj);
                    AuraDOM.showToast(`Updated item ${editId}`, "success");
                } else {
                    AuraStore.addInventoryItem(itemObj);
                    AuraDOM.showToast("Inventory item saved successfully", "success");
                }
                clearInventoryForm();
                refreshInventory();
            } catch (err) {
                AuraDOM.showToast(err.message, "error");
            }
        });
    }

    function clearInventoryForm() {
        $("#inventory-edit-id").value = "";
        $("#inventory-name").value = "";
        $("#inventory-category").value = "Permanent";
        
        // Purchase date default to today's date
        const todayStr = new Date().toISOString().split('T')[0];
        $("#inventory-purchase-date").value = todayStr;
        
        $("#inventory-quantity").value = 1;
        $("#inventory-price").value = 0;
        $("#inventory-total-amount").value = 0;
        $("#inventory-remarks").value = "";
        
        const saveBtn = $("#inventory-form button[type='submit']");
        if (saveBtn) saveBtn.textContent = "Save Item";
        
        $("#inventory-name").focus();
    }

    const btnClearInventory = $("#btn-clear-inventory");
    if (btnClearInventory) {
        btnClearInventory.addEventListener("click", clearInventoryForm);
    }

    // Filters triggers
    const invSearch = $("#inventory-search");
    const invCatFilter = $("#inventory-filter-category");
    if (invSearch) invSearch.addEventListener("input", refreshInventory);
    if (invCatFilter) invCatFilter.addEventListener("change", refreshInventory);

    // List table click delegation (edit/delete)
    const inventoryListTable = $("#inventory-list-table");
    if (inventoryListTable) {
        inventoryListTable.addEventListener("click", function(e) {
            const editBtn = e.target.closest(".btn-edit-inventory");
            const deleteBtn = e.target.closest(".btn-delete-inventory");

            if (editBtn) {
                const id = editBtn.dataset.id;
                const items = AuraStore.getInventory();
                const item = items.find(i => i.id === id);
                if (item) {
                    $("#inventory-edit-id").value = item.id;
                    $("#inventory-name").value = item.name;
                    $("#inventory-category").value = item.category;
                    $("#inventory-purchase-date").value = item.purchaseDate || "";
                    $("#inventory-quantity").value = item.quantity || 1;
                    $("#inventory-price").value = item.price || 0;
                    $("#inventory-total-amount").value = item.totalAmount || 0;
                    $("#inventory-remarks").value = item.remarks || "";
                    
                    const saveBtn = $("#inventory-form button[type='submit']");
                    if (saveBtn) saveBtn.textContent = "Update Item";

                    $("#inventory-name").focus();
                    $("#inventory-form").scrollIntoView({ behavior: 'smooth' });
                }
            }

            if (deleteBtn) {
                const id = deleteBtn.dataset.id;
                if (confirm(`Are you sure you want to delete inventory item ${id}?`)) {
                    AuraStore.deleteInventoryItem(id);
                    AuraDOM.showToast(`Deleted inventory item ${id}`, "info");
                    refreshInventory();
                }
            }
        });
    }

    // CSV Exporter for Inventory
    const btnExportInventory = $("#btn-export-inventory-csv");
    if (btnExportInventory) {
        btnExportInventory.addEventListener("click", () => {
            const items = AuraStore.getInventory();
            if (items.length === 0) {
                AuraDOM.showToast("No inventory items to export.", "error");
                return;
            }

            let csv = "Item ID,Name,Category,Quantity,Price per Item,Total Amount,Purchase Date,Remarks,Last Updated\n";
            items.forEach(item => {
                csv += `"${item.id}","${item.name}","${item.category}",${item.quantity},${item.price},${item.totalAmount},"${item.purchaseDate || ''}","${(item.remarks || '').replace(/"/g, '""')}",${item.lastUpdated || Date.now()}\n`;
            });

            downloadCSVFile(csv, `aurastaff_inventory_${new Date().toISOString().split('T')[0]}.csv`);
            AuraDOM.showToast("Inventory database CSV downloaded", "success");
        });
    }

    // ==========================================================================
    // 7c. Profit & Loss Ledger Actions
    // ==========================================================================
    // Populate month and year select elements
    const financeMonthSelect = $("#finance-month-select");
    const financeYearSelect = $("#finance-year-select");
    if (financeMonthSelect && financeYearSelect) {
        const months = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
        ];
        financeMonthSelect.innerHTML = months.map((m, idx) => `<option value="${idx}">${m}</option>`).join("");
        
        const currentYear = new Date().getFullYear();
        const years = [];
        for (let y = currentYear - 2; y <= currentYear + 2; y++) {
            years.push(y);
        }
        financeYearSelect.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join("");

        // Set default to current month and year
        const today = new Date();
        financeMonthSelect.value = today.getMonth();
        financeYearSelect.value = today.getFullYear();
    }

    function refreshFinance() {
        const monthSel = $("#finance-month-select");
        const yearSel = $("#finance-year-select");
        if (!monthSel || !yearSel) return;
        
        const monthIdx = Number(monthSel.value);
        const yearVal = Number(yearSel.value);
        
        // Render view UI
        AuraDOM.renderFinanceView(monthIdx, yearVal);
        
        // Load saved expenses into input fields
        const monthKey = `${yearVal}-${String(monthIdx + 1).padStart(2, '0')}`;
        const savedExp = AuraStore.getMonthlyFinance(monthKey);
        
        $("#finance-light-bill").value = savedExp.lightBill || 0;
        $("#finance-water-bill").value = savedExp.waterBill || 0;
        $("#finance-other-expenses").value = savedExp.otherExpenses || 0;
        $("#finance-other-details").value = savedExp.otherExpensesDetails || "";

        // Default date for other income
        const otherIncDate = $("#other-income-date");
        if (otherIncDate) {
            otherIncDate.value = new Date().toISOString().split('T')[0];
        }
    }

    if (financeMonthSelect) {
        financeMonthSelect.addEventListener("change", refreshFinance);
    }
    if (financeYearSelect) {
        financeYearSelect.addEventListener("change", refreshFinance);
    }

    const financeForm = $("#finance-expense-form");
    if (financeForm) {
        financeForm.addEventListener("submit", function(e) {
            e.preventDefault();
            const monthIdx = Number($("#finance-month-select").value);
            const yearVal = Number($("#finance-year-select").value);
            const monthKey = `${yearVal}-${String(monthIdx + 1).padStart(2, '0')}`;
            
            const data = {
                lightBill: Number($("#finance-light-bill").value) || 0,
                waterBill: Number($("#finance-water-bill").value) || 0,
                otherExpenses: Number($("#finance-other-expenses").value) || 0,
                otherExpensesDetails: $("#finance-other-details").value.trim()
            };
            
            AuraStore.saveMonthlyFinance(monthKey, data);
            AuraDOM.showToast(`Saved monthly expenses for ${monthKey}`, "success");
            refreshFinance();
        });
    }

    const btnPrintPL = $("#btn-print-pl-report");
    if (btnPrintPL) {
        btnPrintPL.addEventListener("click", () => {
            const monthIdx = Number($("#finance-month-select").value);
            const yearVal = Number($("#finance-year-select").value);
            AuraDOM.printPLReport(monthIdx, yearVal);
        });
    }

    const financeHistoryTable = $("#finance-history-table");
    if (financeHistoryTable) {
        financeHistoryTable.addEventListener("click", function(e) {
            const printBtn = e.target.closest(".btn-print-pl-row");
            if (printBtn) {
                const monthKey = printBtn.dataset.month; // e.g. "2026-05"
                const parts = monthKey.split("-");
                const yearVal = Number(parts[0]);
                const monthIdx = Number(parts[1]) - 1;
                AuraDOM.printPLReport(monthIdx, yearVal);
            }
        });
    }

    // ==========================================================================
    // 8. Settings & Backup Page Actions
    // ==========================================================================
    function loadSettingsValues() {
        const branding = AuraStore.getBranding();
        
        $("#brand-name").value = branding.name;
        $("#brand-tagline").value = branding.tagline || "";
        $("#brand-email").value = branding.email || "";
        $("#brand-phone").value = branding.phone || "";
        $("#brand-address").value = branding.address || "";

        // Firebase values populate
        const configStr = localStorage.getItem("aurastaff_firebase_config") || "";
        $("#settings-firebase-config").value = configStr;

        const badge = $("#firebase-status-badge");
        const icon = $("#firebase-status-icon");
        const text = $("#firebase-status-text");
        const btnConnect = $("#btn-connect-firebase");
        const btnDisconnect = $("#btn-disconnect-firebase");
        const migrationSec = $("#firebase-migration-section");

        if (AuraStore.useFirebase) {
            badge.className = "sync-status-badge success";
            icon.textContent = "cloud_done";
            text.textContent = "Connected (Real-time)";
            btnDisconnect.classList.remove("hide");
            btnConnect.innerHTML = `<span class="material-symbols-outlined" style="font-size: 16px;">check_circle</span> <span>Connected</span>`;
            btnConnect.disabled = true;
            migrationSec.classList.remove("hide");
        } else {
            badge.className = "sync-status-badge error";
            icon.textContent = "cloud_off";
            text.textContent = "Local Mode";
            btnDisconnect.classList.add("hide");
            btnConnect.innerHTML = `<span class="material-symbols-outlined" style="font-size: 16px;">cloud_sync</span> <span>Connect Cloud</span>`;
            btnConnect.disabled = false;
            migrationSec.classList.add("hide");
        }
    }

    // Shortcut click from Dashboard tile
    $("#tile-settings").addEventListener("click", () => {
        switchView("settings");
    });

    // Branding info form submit handler
    $("#settings-branding-form").addEventListener("submit", function(e) {
        e.preventDefault();
        
        const originalBranding = AuraStore.getBranding() || {};
        
        const newBranding = {
            name: originalBranding.name || $("#brand-name").value.trim(),
            tagline: $("#brand-tagline").value.trim(),
            email: $("#brand-email").value.trim(),
            phone: originalBranding.phone || $("#brand-phone").value.trim(),
            address: originalBranding.address || $("#brand-address").value.trim()
        };

        AuraStore.updateBranding(newBranding);
        AuraDOM.showToast("Branding settings updated", "success");
        
        // Reflect branding name changes in sidebar brand label immediately
        $(".sidebar-brand h2").innerHTML = `${newBranding.name.split(" ")[0]}<span>Staff</span>`;
    });

    // Password change form submit handler
    $("#settings-password-form").addEventListener("submit", function(e) {
        e.preventDefault();
        
        const role = $("#change-pwd-role").value;
        const currentPwdInput = $("#change-pwd-current");
        const newPwdInput = $("#change-pwd-new");
        const confirmPwdInput = $("#change-pwd-confirm");
        
        const currentPwd = currentPwdInput.value;
        const newPwd = newPwdInput.value;
        const confirmPwd = confirmPwdInput.value;
        
        const loggedInRole = AuraStore.getUserRole();
        
        // Guard: ensure the user changes only their own password
        let isOwn = false;
        if (loggedInRole === "admin" && role === "admin") isOwn = true;
        if (loggedInRole === "staff" && role === "clerk") isOwn = true;
        if (loggedInRole === "faculty" && role === "faculty") isOwn = true;
        
        if (!isOwn) {
            AuraDOM.showToast("Verification failed: You can only change your own password.", "error");
            return;
        }
        
        const pwdObj = AuraStore.getPasswords();
        const currentTargetPwd = pwdObj[role];
        
        // 1. Verify current password
        if (currentPwd !== currentTargetPwd) {
            AuraDOM.showToast("Verification failed: Current password is incorrect.", "error");
            currentPwdInput.value = "";
            currentPwdInput.focus();
            return;
        }
        
        // 2. Verify new passwords match
        if (newPwd !== confirmPwd) {
            AuraDOM.showToast("New passwords do not match.", "error");
            confirmPwdInput.value = "";
            confirmPwdInput.focus();
            return;
        }
        
        // 3. Verify password length
        if (newPwd.length < 6) {
            AuraDOM.showToast("Password must be at least 6 characters long.", "warning");
            newPwdInput.focus();
            return;
        }
        
        // 4. Perform update
        try {
            AuraStore.changePassword(role, newPwd);
            AuraDOM.showToast(`Password for ${role} updated successfully!`, "success");
            
            // Clear fields
            currentPwdInput.value = "";
            newPwdInput.value = "";
            confirmPwdInput.value = "";
        } catch (err) {
            AuraDOM.showToast(err.message, "error");
        }
    });

    // Demo Database Seeder click
    $("#btn-load-demo").addEventListener("click", () => {
        if (confirm("This will populate your database with mock coaching staff records, attendance sheets, and payroll logs. Proceed?")) {
            AuraStore.seedDemoData();
            AuraDOM.showToast("Demo datasets seeded successfully!", "success");
            
            // Reload all calculations to make sure it aligns
            const today = new Date();
            AuraStore.calculatePayrollForMonth(today.getFullYear(), today.getMonth());
            
            if (currentView === "settings") {
                switchView("dashboard");
            } else {
                renderViewData(currentView);
            }
        }
    });

    // Reset System data click
    $("#btn-wipe-data").addEventListener("click", () => {
        if (confirm("WARNING: This will permanently wipe all staff, payroll ledger, attendance history, and student records from both local cache and Firebase Cloud. Proceed?")) {
            AuraDOM.showToast("Wiping databases...", "warning");
            AuraStore.wipeAllData();
            localStorage.removeItem("aurastaff_firebase_migrated");
            AuraDOM.showToast("Local and Cloud databases wiped successfully!", "success");
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        }
    });

    // System activities panel clean up
    $("#btn-clear-logs").addEventListener("click", () => {
        AuraStore.clearLogs();
        AuraDOM.renderDashboard();
        AuraDOM.showToast("Audit logs cleared", "info");
    });

    // Backup Database Export click
    $("#btn-export-data").addEventListener("click", () => {
        AuraStore.exportDataJSON();
        AuraDOM.showToast("Database backup downloaded", "success");
    });

    // Backup Database Import click
    $("#import-data-file").addEventListener("change", function(e) {
        const file = e.target.files[0];
        if (!file) return;

        AuraStore.importDataJSON(file, function(err, success) {
            if (success) {
                AuraDOM.showToast("Database state successfully restored!", "success");
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
            } else {
                AuraDOM.showToast("Error importing file schema. Verify format.", "error");
            }
        });
    });

    // Firebase Cloud Configuration Actions
    function parseAndSaveFirebaseConfig(configInput, errorElement, successCallback) {
        if (!configInput) {
            if (errorElement) {
                errorElement.querySelector(".setup-error-msg").textContent = "Configuration cannot be empty.";
                errorElement.classList.remove("hide");
            } else {
                AuraDOM.showToast("Please paste your Firebase SDK config object first.", "error");
            }
            return;
        }

        try {
            let configObj;
            const apiKeyIndex = configInput.indexOf("apiKey");
            
            if (apiKeyIndex !== -1) {
                let openBraceIndex = -1;
                for (let i = apiKeyIndex; i >= 0; i--) {
                    if (configInput[i] === '{') {
                        openBraceIndex = i;
                        break;
                    }
                }
                
                let parseString = configInput;
                if (openBraceIndex === -1) {
                    parseString = "{\n" + configInput + "\n}";
                    openBraceIndex = 0;
                }
                
                let closeBraceIndex = -1;
                let bracketCount = 0;
                for (let i = openBraceIndex; i < parseString.length; i++) {
                    if (parseString[i] === '{') {
                        bracketCount++;
                    } else if (parseString[i] === '}') {
                        bracketCount--;
                        if (bracketCount === 0) {
                            closeBraceIndex = i;
                            break;
                        }
                    }
                }
                
                if (closeBraceIndex === -1) {
                    throw new Error("Could not find matching closing brace '}' for config object.");
                }
                
                const objStr = parseString.substring(openBraceIndex, closeBraceIndex + 1);
                configObj = Function("return " + objStr)();
            } else {
                configObj = JSON.parse(configInput);
            }

            if (!configObj || !configObj.apiKey || !configObj.projectId) {
                throw new Error("Pasted configuration must contain apiKey and projectId fields.");
            }

            localStorage.setItem("aurastaff_firebase_config", JSON.stringify(configObj, null, 2));
            if (errorElement) errorElement.classList.add("hide");
            
            if (successCallback) {
                successCallback();
            }
        } catch (e) {
            if (errorElement) {
                errorElement.querySelector(".setup-error-msg").textContent = e.message;
                errorElement.classList.remove("hide");
            } else {
                AuraDOM.showToast("Configuration parsing failed: " + e.message, "error");
            }
            console.error(e);
        }
    }

    function initFirebaseSetupForm() {
        const setupForm = $("#firebase-setup-form");
        if (setupForm) {
            setupForm.addEventListener("submit", function(e) {
                e.preventDefault();
                const configInput = $("#setup-firebase-config").value.trim();
                const errorElement = $("#setup-error");
                
                parseAndSaveFirebaseConfig(configInput, errorElement, () => {
                    AuraDOM.showToast("Firebase configured successfully! Initializing...", "success");
                    setTimeout(() => {
                        window.location.reload();
                    }, 1000);
                });
            });
        }
    }

    $("#btn-connect-firebase").addEventListener("click", () => {
        const configInput = $("#settings-firebase-config").value.trim();
        parseAndSaveFirebaseConfig(configInput, null, () => {
            AuraDOM.showToast("Configuration saved. Connecting to Cloud database...", "success");
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        });
    });

    $("#btn-disconnect-firebase").addEventListener("click", () => {
        if (confirm("Disconnecting from Firebase will reset the app back to configuration gateway mode. Proceed?")) {
            localStorage.removeItem("aurastaff_firebase_config");
            localStorage.removeItem("aurastaff_firebase_migrated");
            AuraDOM.showToast("Disconnected from Firebase.", "warning");
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        }
    });

    $("#btn-firebase-import-local").addEventListener("click", () => {
        if (!AuraStore.useFirebase) {
            AuraDOM.showToast("Firebase is not connected.", "error");
            return;
        }

        if (confirm("This will safely copy all local Staff, Student entries, Inventory details, Attendance history, and Payroll sheets to Firestore. Proceed?")) {
            const btn = $("#btn-firebase-import-local");
            const originalText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = `<span class="material-symbols-outlined animated-spin" style="animation: spin 1.5s linear infinite;">sync</span> <span>Uploading...</span>`;

            AuraStore.uploadLocalToFirebase((err, success) => {
                btn.disabled = false;
                btn.innerHTML = originalText;
                if (success) {
                    AuraDOM.showToast("All local databases successfully synchronized to Firebase Cloud!", "success");
                    renderViewData(currentView);
                } else {
                    AuraDOM.showToast("Cloud sync failed: " + err, "error");
                }
            });
        }
    });

    function updateSyncStatusIndicator() {
        const updateBadge = (el) => {
            if (!el) return;
            const icon = el.querySelector(".status-icon");
            const text = el.querySelector(".status-text");
            
            el.classList.remove("hide");
            
            if (!AuraStore.useFirebase) {
                el.className = "sync-status-badge error";
                if (icon) icon.textContent = "cloud_off";
                if (text) text.textContent = "Disconnected";
                el.title = AuraStore.firebaseInitError || "Disconnected: Operating in Local Offline Mode.";
            } else if (!navigator.onLine) {
                el.className = "sync-status-badge syncing";
                if (icon) icon.textContent = "cloud_queue";
                if (text) text.textContent = "Offline Cache";
                el.title = "Connected to local offline cache. Will sync when network is restored.";
            } else {
                el.className = "sync-status-badge";
                if (icon) icon.textContent = "cloud_done";
                if (text) text.textContent = "Connected (Real-time)";
                el.title = "Connected to Firebase Cloud Firestore database in real-time.";
            }
        };

        updateBadge($("#sync-status-indicator"));
        updateBadge($("#login-sync-status"));
        updateBadge($("#superadmin-sync-status"));
    }

    function downloadCSVFile(csvContent, filename) {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // ==========================================================================
    // 9. Core App Initialization
    // ==========================================================================
    function applyRolePrivileges() {
        const role = AuraStore.getUserRole();
        
        // Hide or show elements depending on user role
        if (role === "faculty") {
            // Hide other menu items
            $$(".menu-item").forEach(item => {
                const view = item.dataset.view;
                if (view === "students" || view === "student-attendance") {
                    item.classList.remove("hide");
                } else {
                    item.classList.add("hide");
                }
            });
            
            // Hide header action buttons
            const quickAdd = $("#btn-quick-add");
            const quickAtt = $("#btn-quick-attendance");
            if (quickAdd) quickAdd.classList.add("hide");
            if (quickAtt) quickAtt.classList.add("hide");
            
            // Update User Pill
            const avatar = $("#current-user-avatar");
            const uName = $(".user-name");
            const uRole = $(".user-role");
            if (avatar) avatar.textContent = "FC";
            if (uName) uName.textContent = "Faculty Member";
            if (uRole) uRole.textContent = "Faculty / Teacher";
            
            // Redirect to student attendance view by default if not on valid view
            if (currentView !== "students" && currentView !== "student-attendance") {
                switchView("student-attendance");
            }
        } else {
            // Restore visibility for admin/staff
            $$(".menu-item").forEach(item => {
                const view = item.dataset.view;
                if ((view === "payroll" || view === "finance") && role !== "admin") {
                    item.classList.add("hide");
                } else {
                    item.classList.remove("hide");
                }
            });
            
            const quickAdd = $("#btn-quick-add");
            const quickAtt = $("#btn-quick-attendance");
            if (quickAdd) quickAdd.classList.remove("hide");
            if (quickAtt) quickAtt.classList.remove("hide");
            
            const avatar = $("#current-user-avatar");
            const uName = $(".user-name");
            const uRole = $(".user-role");
            if (role === "admin") {
                const branding = AuraStore.getBranding() || {};
                const ownerName = branding.owner || "Administrator";
                const instName = branding.name || "Institute Admin";
                
                if (avatar) {
                    avatar.textContent = ownerName.split(" ")
                        .map(n => n.charAt(0))
                        .join("")
                        .slice(0, 2)
                        .toUpperCase() || "AD";
                }
                if (uName) uName.textContent = ownerName;
                if (uRole) uRole.textContent = instName;
            } else {
                if (avatar) avatar.textContent = "ST";
                if (uName) uName.textContent = "Staff Member";
                if (uRole) uRole.textContent = "Office Clerk";
            }

            // Enforce clerk redirect
            if (currentView === "payroll") {
                switchView("dashboard");
            }
        }

        // Update password change role dropdown to only show the user's own role
        const selectRole = $("#change-pwd-role");
        const currentPwdLabel = $("label[for='change-pwd-current']");
        const currentPwdInput = $("#change-pwd-current");
        
        if (selectRole) {
            selectRole.innerHTML = "";
            if (role === "admin") {
                selectRole.innerHTML = `<option value="admin">Super Administrator (admin)</option>`;
                if (currentPwdLabel) currentPwdLabel.textContent = "Current Admin Password *";
                if (currentPwdInput) currentPwdInput.placeholder = "Enter current admin password";
            } else if (role === "staff") {
                selectRole.innerHTML = `<option value="clerk">Office Clerk (clerk)</option>`;
                if (currentPwdLabel) currentPwdLabel.textContent = "Current Clerk Password *";
                if (currentPwdInput) currentPwdInput.placeholder = "Enter current clerk password";
            } else if (role === "faculty") {
                selectRole.innerHTML = `<option value="faculty">Faculty Member (faculty)</option>`;
                if (currentPwdLabel) currentPwdLabel.textContent = "Current Faculty Password *";
                if (currentPwdInput) currentPwdInput.placeholder = "Enter current faculty password";
            }
        }
    }

    function initApp() {
        initTheme();
        applyRolePrivileges();
        initAttendanceView();
        initPayrollView();
        
        // Initial dashboard draw
        AuraDOM.renderDashboard();
        
        // Populate report courses and render dashboard report
        populateReportCoursesFilter();
        
        // Initialize inventory form and default values
        clearInventoryForm();
        
        // Bind Reports Hub Tab Clicks
        $$(".report-tab-btn").forEach(btn => {
            btn.addEventListener("click", function() {
                const targetTab = this.dataset.tab;
                
                $$(".report-tab-btn").forEach(b => {
                    b.classList.remove("btn-primary");
                    b.classList.add("btn-outline");
                });
                this.classList.add("btn-primary");
                this.classList.remove("btn-outline");
                
                $$(".filter-group-row").forEach(fg => fg.classList.add("hide"));
                const fgEl = $(`#filter-group-${targetTab}`);
                if (fgEl) fgEl.classList.remove("hide");
                
                activeReportTab = targetTab;
                if (targetTab === "students") {
                    populateReportCoursesFilter();
                }
                refreshReports();
            });
        });

        // Bind Reports Filters
        const bindFilter = (id, event = "change") => {
            const el = $(id);
            if (el) el.addEventListener(event, () => refreshReports());
        };
        bindFilter("#faculty-report-search", "input");
        bindFilter("#faculty-report-dept", "change");
        bindFilter("#faculty-report-status", "change");
        
        bindFilter("#payroll-report-month", "change");
        bindFilter("#payroll-report-year", "change");
        bindFilter("#payroll-report-status", "change");
        
        bindFilter("#student-report-search", "input");
        bindFilter("#student-report-course", "change");
        bindFilter("#student-report-dues", "change");
        bindFilter("#student-report-due-date", "change");

        // Bind Reports Exports
        const btnExcel = $("#btn-report-export-excel");
        if (btnExcel) {
            btnExcel.addEventListener("click", () => {
                const headers = Array.from(document.querySelectorAll("#reports-table-header th")).map(th => th.textContent.trim());
                const rows = Array.from(document.querySelectorAll("#reports-table-body tr")).map(tr => {
                    const tds = Array.from(tr.querySelectorAll("td"));
                    if (tds.length === 1 && tr.querySelector(".text-center")) return null;
                    return tds.map(td => td.textContent.trim());
                }).filter(r => r !== null);

                if (rows.length === 0) {
                    AuraDOM.showToast("No data to export.", "error");
                    return;
                }

                const filename = `samyak_${activeReportTab}_report_${new Date().toISOString().split('T')[0]}.csv`;
                AuraStore.downloadExcelReport(filename, headers, rows);
                AuraDOM.showToast("Report exported successfully", "success");
            });
        }

        const btnPdf = $("#btn-report-print-pdf");
        if (btnPdf) {
            btnPdf.addEventListener("click", () => {
                const headers = Array.from(document.querySelectorAll("#reports-table-header th")).map(th => th.textContent.trim());
                const rows = Array.from(document.querySelectorAll("#reports-table-body tr")).map(tr => {
                    const tds = Array.from(tr.querySelectorAll("td"));
                    if (tds.length === 1 && tr.querySelector(".text-center")) return null;
                    return tds.map(td => td.textContent.trim());
                }).filter(r => r !== null);

                if (rows.length === 0) {
                    AuraDOM.showToast("No data to print.", "error");
                    return;
                }

                const title = `${activeReportTab.charAt(0).toUpperCase() + activeReportTab.slice(1)} Report`;
                AuraDOM.printReport(title, headers, rows);
            });
        }

        updateSyncStatusIndicator();
        window.addEventListener("online", updateSyncStatusIndicator);
        window.addEventListener("offline", updateSyncStatusIndicator);

        // Bind escape key to close modals
        document.addEventListener("keydown", function(e) {
            if (e.key === "Escape") {
                $$(".modal-overlay").forEach(modal => modal.classList.add("hide"));
            }
        });

        // Close modal when clicking outside modal-card (on modal-overlay)
        document.addEventListener("click", function(e) {
            if (e.target.classList.contains("modal-overlay")) {
                e.target.classList.add("hide");
            }
        });
        
        // Record Student Payment form submit handler
        const recordPaymentForm = $("#record-payment-form");
        if (recordPaymentForm) {
            recordPaymentForm.addEventListener("submit", function(e) {
                e.preventDefault();
                const studentId = $("#payment-student-id").value;
                const amount = Number($("#payment-amount").value) || 0;
                const date = $("#payment-date").value;
                const remarks = $("#payment-remarks").value.trim();
                
                const feeTypes = [];
                document.querySelectorAll('input[name="payment-fee-type-cb"]:checked').forEach(cb => {
                    feeTypes.push(cb.value);
                });
                
                if (amount <= 0 || !date || feeTypes.length === 0) {
                    AuraDOM.showToast("Please enter valid amount, date, and select a fee type.", "error");
                    return;
                }
                
                const dueAmt = Number($("#payment-student-due").value) || 0;
                if (amount > dueAmt) {
                    AuraDOM.showToast("Payment amount cannot exceed remaining due balance.", "error");
                    return;
                }
                
                try {
                    AuraStore.recordStudentPayment(studentId, {
                        amount,
                        date,
                        feeType: feeTypes,
                        remarks: remarks || "Installment payment"
                    });
                    
                    $("#modal-record-payment").classList.add("hide");
                    AuraDOM.showToast("Payment recorded successfully!", "success");
                    
                    // Auto-send WhatsApp message to parent
                    const updatedStudent = AuraStore.getStudents().find(s => s.id === studentId);
                    if (updatedStudent) {
                        const parentPhone = updatedStudent.parentMobile || updatedStudent.mobile || "";
                        if (parentPhone) {
                            const branding = AuraStore.getBranding();
                            const instName = branding.name || "Samyak Computer Classes";
                            const remainingDue = Math.max(0, Number(updatedStudent.courseFee || 0) - Number(updatedStudent.amountReceived || 0));
                            const message = `Dear Parent, we have successfully received a payment of ₹${amount} for your child ${updatedStudent.name}. Total amount received till date: ₹${updatedStudent.amountReceived}. Remaining balance due: ₹${remainingDue}. Regards, ${instName}`;
                            
                            let formattedPhone = parentPhone.replace(/\D/g, '');
                            if (formattedPhone.length === 10) {
                                formattedPhone = "91" + formattedPhone;
                            }
                            const whatsappUrl = `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(message)}`;
                            setTimeout(() => {
                                window.open(whatsappUrl, '_blank');
                            }, 1000);
                        }
                    }
                    
                    // Refresh views
                    refreshStudents();
                    refreshFinance();
                } catch (err) {
                    AuraDOM.showToast(err.message, "error");
                }
            });
        }

        // Other Income Tracker form submit handler
        const otherIncomeForm = $("#finance-other-income-form");
        if (otherIncomeForm) {
            otherIncomeForm.addEventListener("submit", function(e) {
                e.preventDefault();
                const monthSel = $("#finance-month-select");
                const yearSel = $("#finance-year-select");
                if (!monthSel || !yearSel) return;
                const monthIdx = Number(monthSel.value);
                const yearVal = Number(yearSel.value);
                const monthKey = `${yearVal}-${String(monthIdx + 1).padStart(2, '0')}`;
                
                const amount = Number($("#other-income-amount").value) || 0;
                const date = $("#other-income-date").value;
                const source = $("#other-income-source").value.trim();
                
                if (amount <= 0 || !date || !source) {
                    AuraDOM.showToast("Please enter a valid amount, date, and source details.", "error");
                    return;
                }
                
                AuraStore.addOtherIncome(monthKey, { amount, date, source });
                AuraDOM.showToast(`Recorded other income of ₹${amount} successfully!`, "success");
                otherIncomeForm.reset();
                $("#other-income-date").value = new Date().toISOString().split('T')[0];
                
                // Refresh
                refreshFinance();
            });
        }

        // Other Income List delete click handler
        const otherIncomeTable = $("#other-income-list-table");
        if (otherIncomeTable) {
            otherIncomeTable.addEventListener("click", function(e) {
                const deleteBtn = e.target.closest(".btn-delete-other-income");
                if (deleteBtn) {
                    const monthSel = $("#finance-month-select");
                    const yearSel = $("#finance-year-select");
                    if (!monthSel || !yearSel) return;
                    const monthIdx = Number(monthSel.value);
                    const yearVal = Number(yearSel.value);
                    const monthKey = `${yearVal}-${String(monthIdx + 1).padStart(2, '0')}`;
                    
                    const itemId = deleteBtn.dataset.id;
                    if (confirm("Are you sure you want to delete this other income entry?")) {
                        AuraStore.deleteOtherIncome(monthKey, itemId);
                        AuraDOM.showToast("Other income entry deleted.", "info");
                        refreshFinance();
                    }
                }
            });
        }

        // Student Attendance handlers
        const studentAttendanceDateInput = $("#student-attendance-date");
        if (studentAttendanceDateInput) {
            const todayStr = new Date().toISOString().split('T')[0];
            studentAttendanceDateInput.value = todayStr;
            studentAttendanceDateInput.addEventListener("change", refreshStudentAttendance);
        }

        const btnSaveStudentAttendance = $("#btn-save-student-attendance");
        if (btnSaveStudentAttendance) {
            btnSaveStudentAttendance.addEventListener("click", function() {
                const dateInput = $("#student-attendance-date");
                if (!dateInput) return;
                const selectedDate = dateInput.value;
                if (!selectedDate) {
                    AuraDOM.showToast("Please select a date.", "error");
                    return;
                }

                const students = AuraStore.getStudents();
                const records = {};

                students.forEach(s => {
                    const radioAbs = document.querySelector(`input[name="attendance-${s.id}"][value="Absent"]`);
                    const remarksInput = $(`#remarks-${s.id}`);

                    let status = "Present";
                    if (radioAbs && radioAbs.checked) {
                        status = "Absent";
                    }

                    records[s.id] = {
                        status: status,
                        remarks: remarksInput ? remarksInput.value.trim() : "",
                        lastUpdated: Date.now()
                    };
                });

                AuraStore.saveStudentAttendance(selectedDate, records);
                AuraDOM.showToast(`Saved student attendance registers for ${selectedDate}.`, "success");
                refreshStudentAttendance();
            });
        }

        const btnStudentMarkAllPresent = $("#btn-student-mark-all-present");
        if (btnStudentMarkAllPresent) {
            btnStudentMarkAllPresent.addEventListener("click", () => {
                document.querySelectorAll('#student-attendance-table input[type="radio"][value="Present"]').forEach(radio => {
                    radio.checked = true;
                });
            });
        }

        const btnStudentMarkAllAbsent = $("#btn-student-mark-all-absent");
        if (btnStudentMarkAllAbsent) {
            btnStudentMarkAllAbsent.addEventListener("click", () => {
                document.querySelectorAll('#student-attendance-table input[type="radio"][value="Absent"]').forEach(radio => {
                    radio.checked = true;
                });
            });
        }

        const studentAttendanceTable = $("#student-attendance-table");
        if (studentAttendanceTable) {
            studentAttendanceTable.addEventListener("click", function(e) {
                const shareBtn = e.target.closest(".btn-share-attendance");
                if (shareBtn) {
                    const id = shareBtn.dataset.id;
                    const students = AuraStore.getStudents();
                    const student = students.find(s => s.id === id);
                    if (student) {
                        const parentMobile = student.parentMobile || student.mobile || "";
                        if (!parentMobile) {
                            AuraDOM.showToast("No parent or student mobile number available.", "error");
                            return;
                        }

                        const radioAbs = document.querySelector(`input[name="attendance-${id}"][value="Absent"]`);
                        let status = "Present";
                        if (radioAbs && radioAbs.checked) status = "Absent";

                        const branding = AuraStore.getBranding();
                        const instName = branding.name || "Samyak Computer Classes";
                        
                        let message = "";
                        if (status === "Present") {
                            message = `Dear Parent, today is your child ${student.name} is present. Regards, ${instName}`;
                        } else {
                            message = `Dear Parent, today is your child ${student.name} is absent. Please contact us for details. Regards, ${instName}`;
                        }

                        let formattedPhone = parentMobile.replace(/\D/g, '');
                        if (formattedPhone.length === 10) {
                            formattedPhone = "91" + formattedPhone;
                        }

                        const whatsappUrl = `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(message)}`;
                        window.open(whatsappUrl, '_blank');
                        AuraStore.logActivity(`Attendance WhatsApp alert sent to parent of ${student.name}`, "info");
                    }
                }
            });
        }

        // Load initial branding sidebar title
        const brand = AuraStore.getBranding();
        if (brand && brand.name) {
            $(".sidebar-brand h2").innerHTML = `${brand.name.split(" ")[0]}<span>Staff</span>`;
        }
    }

    // Entry Gate
    checkAuth();

    // Register PWA Service Worker
    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("./sw.js")
            .then((reg) => console.log("Service Worker registered successfully:", reg.scope))
            .catch((err) => console.error("Service Worker registration failed:", err));
    }

    // PWA Install Event Handler
    let deferredPrompt;
    const installRow = $("#pwa-install-row");
    const installedRow = $("#pwa-installed-row");
    const installBtn = $("#btn-install-pwa");

    // Check if app is already running in standalone mode
    if (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true) {
        if (installRow) installRow.classList.add("hide");
        if (installedRow) installedRow.classList.remove("hide");
    }

    window.addEventListener("beforeinstallprompt", (e) => {
        // Prevent Chrome 67 and earlier from automatically showing the prompt
        e.preventDefault();
        // Stash the event so it can be triggered later.
        deferredPrompt = e;
        // Show the install UI row (if we are not already standalone)
        const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
        if (!isStandalone) {
            if (installRow) installRow.classList.remove("hide");
            if (installedRow) installedRow.classList.add("hide");
        }
    });

    if (installBtn) {
        installBtn.addEventListener("click", () => {
            if (!deferredPrompt) {
                AuraDOM.showToast("Installation is handled by your browser. Look for the install icon in your browser's address bar!", "info");
                return;
            }
            // Show the prompt
            deferredPrompt.prompt();
            // Wait for the user to respond to the prompt
            deferredPrompt.userChoice.then((choiceResult) => {
                if (choiceResult.outcome === "accepted") {
                    console.log("User accepted the install prompt");
                    AuraDOM.showToast("ApexStaff Installation initiated!", "success");
                    if (installRow) installRow.classList.add("hide");
                    if (installedRow) installedRow.classList.remove("hide");
                } else {
                    console.log("User dismissed the install prompt");
                }
                deferredPrompt = null;
            });
        });
    }

    window.addEventListener("appinstalled", (evt) => {
        console.log("Smart Office was installed successfully!");
        AuraDOM.showToast("Smart Office successfully installed on your desktop!", "success");
        if (installRow) installRow.classList.add("hide");
        if (installedRow) installedRow.classList.remove("hide");
    });

    let superAdminInitialized = false;
    async function initSuperAdmin() {
        if (superAdminInitialized) {
            refreshSuperAdminInstitutes();
            return;
        }
        superAdminInitialized = true;
        
        console.log("Initializing Super Admin Dashboard controller...");
        
        let editModeTenantId = null;
        
        // 1. Date display
        const dateEl = $("#superadmin-header-date");
        if (dateEl) {
            dateEl.textContent = new Date().toLocaleDateString(undefined, { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            });
        }
        
        // 2. Sync indicator
        updateSyncStatusIndicator();
        
        // 3. Logo upload preview & storage
        let saLogoBase64 = null;
        const saLogoUpload = $("#sa-logo-upload");
        if (saLogoUpload) {
            saLogoUpload.addEventListener("change", function(e) {
                const file = e.target.files[0];
                if (!file) return;
                
                if (file.size > 150 * 1024) {
                    AuraDOM.showToast("Logo image size must be less than 150KB.", "error");
                    saLogoUpload.value = "";
                    return;
                }
                
                const reader = new FileReader();
                reader.onload = function(evt) {
                    saLogoBase64 = evt.target.result;
                    const preview = $("#sa-logo-preview");
                    if (preview) preview.src = saLogoBase64;
                };
                reader.readAsDataURL(file);
            });
        }
        
        // 4. Color theme sync
        const saTheme = $("#sa-theme");
        const saThemeText = $("#sa-theme-text");
        if (saTheme && saThemeText) {
            saTheme.addEventListener("input", function() {
                saThemeText.value = this.value;
            });
            saThemeText.addEventListener("input", function() {
                const val = this.value.trim();
                if (/^#[0-9A-F]{6}$/i.test(val)) {
                    saTheme.value = val;
                }
            });
        }
        
        function setFormMode(mode, tenantData = null) {
            const formIcon = $("#sa-form-icon");
            const formTitle = $("#sa-form-title");
            const formDesc = $("#sa-form-desc");
            const submitBtn = $("#sa-submit-btn");
            const cancelBtn = $("#btn-sa-cancel");
            const tenantInput = $("#sa-tenant-id");
            const emailInput = $("#sa-admin-email");
            const pwdInput = $("#sa-admin-password");

            if (mode === "edit") {
                editModeTenantId = tenantData.tenantId;
                
                if (formIcon) {
                    formIcon.textContent = "edit";
                    formIcon.style.color = "var(--color-info)";
                }
                if (formTitle) formTitle.textContent = "Edit Coaching Institute";
                if (formDesc) formDesc.textContent = "Modify institute parameters.";
                
                if (submitBtn) {
                    submitBtn.innerHTML = `<span class="material-symbols-outlined">save</span><span>Update Institute Details</span>`;
                }
                if (cancelBtn) cancelBtn.classList.remove("hide");
                
                if (tenantInput) {
                    tenantInput.value = tenantData.tenantId;
                    tenantInput.readOnly = true;
                }
                if (emailInput) {
                    emailInput.value = tenantData.email;
                    emailInput.readOnly = true;
                }
                if (pwdInput) {
                    pwdInput.disabled = true;
                    pwdInput.required = false;
                    pwdInput.value = "";
                    pwdInput.placeholder = "Use card actions to change password";
                }
                
                $("#sa-inst-name").value = tenantData.name;
                $("#sa-owner-name").value = tenantData.owner;
                $("#sa-mobile").value = tenantData.phone;
                $("#sa-address").value = tenantData.address;
                $("#sa-theme").value = tenantData.theme;
                $("#sa-theme-text").value = tenantData.theme;
                
                const preview = $("#sa-logo-preview");
                if (preview) preview.src = tenantData.logo || "icons/logo.jpg";
                saLogoBase64 = null;
            } else {
                editModeTenantId = null;
                
                if (formIcon) {
                    formIcon.textContent = "add_business";
                    formIcon.style.color = "var(--color-primary)";
                }
                if (formTitle) formTitle.textContent = "Register New Institute";
                if (formDesc) formDesc.textContent = "Configure tenant ID and admin credentials.";
                
                if (submitBtn) {
                    submitBtn.innerHTML = `<span class="material-symbols-outlined">domain_add</span><span>Create Institute & Admin User</span>`;
                }
                if (cancelBtn) cancelBtn.classList.add("hide");
                
                if (tenantInput) {
                    tenantInput.value = "";
                    tenantInput.readOnly = false;
                }
                if (emailInput) {
                    emailInput.value = "";
                    emailInput.readOnly = false;
                }
                if (pwdInput) {
                    pwdInput.disabled = false;
                    pwdInput.required = true;
                    pwdInput.value = "";
                    pwdInput.placeholder = "e.g. password123";
                }
                
                saForm.reset();
                const preview = $("#sa-logo-preview");
                if (preview) preview.src = "icons/logo.jpg";
                saLogoBase64 = null;
            }
        }

        // Cancel edit mode button
        const cancelBtn = $("#btn-sa-cancel");
        if (cancelBtn) {
            cancelBtn.addEventListener("click", function() {
                setFormMode("create");
            });
        }
        
        // 5. Create institute form submission
        const saForm = $("#superadmin-create-form");
        if (saForm) {
            saForm.addEventListener("submit", async function(e) {
                e.preventDefault();
                
                const tenantId = $("#sa-tenant-id").value.trim().toLowerCase();
                const name = $("#sa-inst-name").value.trim();
                const owner = $("#sa-owner-name").value.trim();
                const mobile = $("#sa-mobile").value.trim();
                const address = $("#sa-address").value.trim();
                const email = $("#sa-admin-email").value.trim().toLowerCase();
                const password = $("#sa-admin-password").value.trim();
                const theme = saTheme ? saTheme.value : "#6366f1";
                
                if (!/^[a-z0-9]+$/.test(tenantId)) {
                    AuraDOM.showToast("Tenant ID must contain only lowercase letters and numbers (no spaces).", "error");
                    return;
                }

                const phoneRegex = /^[0-9]{10}$/;
                if (!phoneRegex.test(mobile)) {
                    AuraDOM.showToast("Contact Mobile must be exactly 10 digits.", "error");
                    return;
                }
                
                if (editModeTenantId === null) {
                    if (password.length < 6) {
                        AuraDOM.showToast("Admin login password must be at least 6 characters.", "error");
                        return;
                    }
                }
                
                const submitBtn = $("#sa-submit-btn");
                submitBtn.disabled = true;
                const oldHTML = submitBtn.innerHTML;
                
                if (editModeTenantId !== null) {
                    submitBtn.innerHTML = `<span class="material-symbols-outlined animated-spin" style="font-size:18px;">sync</span><span>Updating Tenant...</span>`;
                } else {
                    submitBtn.innerHTML = `<span class="material-symbols-outlined animated-spin" style="font-size:18px;">sync</span><span>Configuring Tenant...</span>`;
                }
                
                try {
                    let res;
                    if (editModeTenantId !== null) {
                        res = await AuraStore.updateTenantDetails(editModeTenantId, email, name, theme, owner, mobile, address, saLogoBase64);
                    } else {
                        res = await AuraStore.createTenant(tenantId, email, name, theme, owner, mobile, address, password, saLogoBase64);
                    }
                    
                    if (res.success) {
                        AuraDOM.showToast(res.message, "success");
                        setFormMode("create");
                        refreshSuperAdminInstitutes();
                    } else {
                        AuraDOM.showToast(res.message, "error");
                    }
                } catch (err) {
                    AuraDOM.showToast(err.message || err, "error");
                } finally {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = oldHTML;
                }
            });
        }
        
        // 6. Bind Search Input
        const searchInput = $("#sa-search-inst");
        if (searchInput) {
            searchInput.addEventListener("input", refreshSuperAdminInstitutes);
        }
        
        // 7. Bind Action Buttons (Edit, Delete & Update Password)
        const saList = $("#sa-institutes-list");
        if (saList) {
            saList.addEventListener("click", async function(e) {
                const editBtn = e.target.closest(".btn-sa-edit-inst");
                const deleteBtn = e.target.closest(".btn-sa-delete-inst");
                const updatePwdBtn = e.target.closest(".btn-sa-update-pwd");
                
                if (editBtn) {
                    const tenantId = editBtn.dataset.tenant;
                    const institutes = await AuraStore.getRegisteredInstitutes();
                    const inst = institutes.find(i => i.tenantId === tenantId);
                    if (inst) {
                        setFormMode("edit", inst);
                        if (saForm) saForm.scrollIntoView({ behavior: 'smooth' });
                    }
                }
                
                if (deleteBtn) {
                    const tenantId = deleteBtn.dataset.tenant;
                    const email = deleteBtn.dataset.email;
                    
                    if (confirm(`Are you absolutely sure you want to delete the coaching institute '${tenantId}'?\nAll system profiles, database configurations, and admin access for '${email}' will be revoked.`)) {
                        deleteBtn.disabled = true;
                        try {
                            const res = await AuraStore.deleteTenant(tenantId, email);
                            if (res.success) {
                                AuraDOM.showToast(res.message, "success");
                                if (editModeTenantId === tenantId) {
                                    setFormMode("create");
                                }
                                refreshSuperAdminInstitutes();
                            } else {
                                AuraDOM.showToast(res.message, "error");
                                deleteBtn.disabled = false;
                            }
                        } catch (err) {
                            AuraDOM.showToast(err.message || err, "error");
                            deleteBtn.disabled = false;
                        }
                    }
                }
                
                if (updatePwdBtn) {
                    const tenantId = updatePwdBtn.dataset.tenant;
                    const email = updatePwdBtn.dataset.email;
                    const oldPassword = updatePwdBtn.dataset.oldpwd;
                    
                    const card = updatePwdBtn.closest(".sa-inst-card");
                    const input = card.querySelector(".input-sa-new-pwd");
                    const newPassword = input.value.trim();
                    
                    if (!newPassword || newPassword.length < 6) {
                        AuraDOM.showToast("Please enter a new password (minimum 6 characters).", "error");
                        return;
                    }
                    
                    updatePwdBtn.disabled = true;
                    updatePwdBtn.innerHTML = `<span class="material-symbols-outlined animated-spin" style="font-size:14px;">sync</span><span>Updating...</span>`;
                    
                    try {
                        const res = await AuraStore.updateAdminPassword(email, tenantId, oldPassword, newPassword);
                        if (res.success) {
                            AuraDOM.showToast(res.message, "success");
                            refreshSuperAdminInstitutes();
                        } else {
                            AuraDOM.showToast(res.message, "error");
                            updatePwdBtn.disabled = false;
                            updatePwdBtn.innerHTML = `<span class="material-symbols-outlined" style="font-size:14px;">vpn_key</span><span>Update Password</span>`;
                        }
                    } catch (err) {
                        AuraDOM.showToast(err.message || err, "error");
                        updatePwdBtn.disabled = false;
                        updatePwdBtn.innerHTML = `<span class="material-symbols-outlined" style="font-size:14px;">vpn_key</span><span>Update Password</span>`;
                    }
                }
                
                const toggleStatusBtn = e.target.closest(".btn-sa-toggle-status");
                if (toggleStatusBtn) {
                    const tenantId = toggleStatusBtn.dataset.tenant;
                    const isActive = toggleStatusBtn.dataset.active === "true";
                    const newStatus = !isActive;
                    
                    toggleStatusBtn.disabled = true;
                    toggleStatusBtn.innerHTML = `<span class="material-symbols-outlined animated-spin" style="font-size:14px;">sync</span><span>Updating...</span>`;
                    
                    try {
                        const res = await AuraStore.toggleTenantStatus(tenantId, newStatus);
                        if (res.success) {
                            AuraDOM.showToast(res.message, "success");
                            refreshSuperAdminInstitutes();
                        } else {
                            AuraDOM.showToast(res.message, "error");
                            toggleStatusBtn.disabled = false;
                            toggleStatusBtn.innerHTML = `<span class="material-symbols-outlined" style="font-size:14px;">${isActive ? 'block' : 'check_circle'}</span><span>${isActive ? 'Deactivate' : 'Activate'}</span>`;
                        }
                    } catch (err) {
                        AuraDOM.showToast(err.message || err, "error");
                        toggleStatusBtn.disabled = false;
                        toggleStatusBtn.innerHTML = `<span class="material-symbols-outlined" style="font-size:14px;">${isActive ? 'block' : 'check_circle'}</span><span>${isActive ? 'Deactivate' : 'Activate'}</span>`;
                    }
                }
            });
        }
        
        // 8. Bind Logout Button
        const logoutBtn = $("#btn-superadmin-logout");
        if (logoutBtn) {
            logoutBtn.addEventListener("click", function() {
                AuraStore.logout();
                AuraDOM.showToast("Super Admin logged out.", "info");
                setTimeout(() => {
                    window.location.reload();
                }, 500);
            });
        }

        // 8.5 Bind Clean Legacy Button
        const cleanLegacyBtn = $("#btn-sa-clean-legacy");
        if (cleanLegacyBtn) {
            cleanLegacyBtn.addEventListener("click", async function() {
                if (confirm("WARNING: This will permanently delete all legacy data stored in Firebase root collections (staff, students, attendance, payroll, PL ledger) and the 'admin' tenant configuration and its subcollections. This action is irreversible and should only be performed once to clean up early databases. Proceed?")) {
                    cleanLegacyBtn.disabled = true;
                    const originalText = cleanLegacyBtn.innerHTML;
                    cleanLegacyBtn.innerHTML = `<span class="material-symbols-outlined animated-spin" style="font-size: 16px; margin-right: 4px;">sync</span><span>Cleaning...</span>`;
                    
                    try {
                        const res = await AuraStore.cleanLegacyData();
                        if (res.success) {
                            AuraDOM.showToast(res.message, "success");
                            refreshSuperAdminInstitutes();
                        } else {
                            AuraDOM.showToast(res.message, "error");
                        }
                    } catch (err) {
                        AuraDOM.showToast(err.message || err, "error");
                    } finally {
                        cleanLegacyBtn.disabled = false;
                        cleanLegacyBtn.innerHTML = originalText;
                    }
                }
            });
        }
        
        // 9. Theme Toggle
        const themeToggle = $("#superadmin-theme-toggle");
        if (themeToggle) {
            themeToggle.addEventListener("click", () => {
                const nowTheme = document.documentElement.getAttribute("data-theme");
                const newTheme = nowTheme === "dark" ? "light" : "dark";
                
                document.documentElement.setAttribute("data-theme", newTheme);
                localStorage.setItem("aurastaff_theme", newTheme);
            });
        }
        
        // Initial list render
        refreshSuperAdminInstitutes();
    }
    
    async function refreshSuperAdminInstitutes() {
        const listContainer = $("#sa-institutes-list");
        if (!listContainer) return;
        
        listContainer.innerHTML = `
            <div style="display:flex; justify-content:center; align-items:center; height:100px; color:var(--text-secondary);">
                <span class="material-symbols-outlined animated-spin" style="font-size:24px; margin-right:8px;">sync</span>
                <span>Loading institutes...</span>
            </div>
        `;
        
        const searchVal = $("#sa-search-inst") ? $("#sa-search-inst").value.toLowerCase().trim() : "";
        const institutes = await AuraStore.getRegisteredInstitutes();
        
        const filtered = institutes.filter(inst => {
            return inst.name.toLowerCase().includes(searchVal) ||
                   inst.tenantId.toLowerCase().includes(searchVal) ||
                   inst.email.toLowerCase().includes(searchVal) ||
                   inst.owner.toLowerCase().includes(searchVal);
        });
        
        if (filtered.length === 0) {
            listContainer.innerHTML = `
                <div style="text-align:center; padding:40px; color:var(--text-muted);">
                    <span class="material-symbols-outlined" style="font-size:48px;">domain_disabled</span>
                    <p style="margin-top:10px; font-size:14px;">No coaching institutes found.</p>
                </div>
            `;
            return;
        }
        
        listContainer.innerHTML = "";
        filtered.forEach(inst => {
            const card = document.createElement("div");
            card.className = "sa-inst-card";
            card.style = `border-left: 4px solid ${inst.theme}; position: relative;`;
            
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <div style="width: 48px; height: 48px; border-radius: 6px; background: var(--bg-input); border: 1px solid var(--color-border); display:flex; align-items:center; justify-content:center; overflow:hidden;">
                            <img src="${inst.logo}" style="width:100%; height:100%; object-fit:contain;">
                        </div>
                        <div>
                            <h4 style="margin:0; font-size:15px; font-weight:700; color:var(--text-primary);">${inst.name}</h4>
                            <div style="display:flex; align-items:center; gap:6px; margin-top:2px;">
                                <span class="sync-status-badge" style="padding:2px 6px; font-size:9.5px; border-radius:4px; font-weight:700; color:${inst.theme}; background:rgba(${hexToRgb(inst.theme)}, 0.1); border:1px solid rgba(${hexToRgb(inst.theme)}, 0.25);">ID: ${inst.tenantId}</span>
                                <span class="sync-status-badge ${inst.active !== false ? 'success' : 'error'}" style="padding:2px 6px; font-size:9.5px; border-radius:4px; font-weight:700; display:inline-flex; align-items:center; gap:2px;">
                                    <span class="material-symbols-outlined" style="font-size:10px;">${inst.active !== false ? 'check_circle' : 'cancel'}</span>
                                    <span>${inst.active !== false ? 'Active' : 'Deactivated'}</span>
                                </span>
                            </div>
                        </div>
                    </div>
                    
                    <div style="display:flex; gap:6px;">
                        <button class="btn btn-outline btn-sa-toggle-status" data-tenant="${inst.tenantId}" data-active="${inst.active !== false}" style="height: 30px; padding: 0 10px; font-size: 11px; display:flex; align-items:center; gap:4px; border-color:${inst.active !== false ? 'var(--color-danger)' : 'var(--color-success)'}; color:${inst.active !== false ? 'var(--color-danger)' : 'var(--color-success)'};">
                            <span class="material-symbols-outlined" style="font-size:14px;">${inst.active !== false ? 'block' : 'check_circle'}</span>
                            <span>${inst.active !== false ? 'Deactivate' : 'Activate'}</span>
                        </button>
                        <button class="btn btn-outline btn-sa-edit-inst" data-tenant="${inst.tenantId}" style="height: 30px; padding: 0 10px; font-size: 11px; display:flex; align-items:center; gap:4px;">
                            <span class="material-symbols-outlined" style="font-size:14px;">edit</span>
                            <span>Edit</span>
                        </button>
                        <button class="btn btn-danger btn-sa-delete-inst" data-tenant="${inst.tenantId}" data-email="${inst.email}" style="height: 30px; padding: 0 10px; font-size: 11px; display:flex; align-items:center; gap:4px;">
                            <span class="material-symbols-outlined" style="font-size:14px;">delete</span>
                            <span>Remove</span>
                        </button>
                    </div>
                </div>
                
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px 15px; font-size:12.5px; border-top:1px solid var(--color-border); border-bottom:1px solid var(--color-border); padding:10px 0; margin-top:5px; color:var(--text-secondary);">
                    <div><strong>Owner:</strong> ${inst.owner || "N/A"}</div>
                    <div><strong>Mobile:</strong> ${inst.phone || "N/A"}</div>
                    <div style="grid-column: span 2;"><strong>Admin Email:</strong> <span style="font-family:monospace; color:var(--text-primary);">${inst.email}</span></div>
                    <div style="grid-column: span 2;"><strong>Address:</strong> ${inst.address || "N/A"}</div>
                </div>
                
                <div style="margin-top: 5px; display:flex; flex-direction:column; gap:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:11.5px; color:var(--text-muted); display:inline-flex; align-items:center; gap:4px;">
                            <span class="material-symbols-outlined" style="font-size:13px;">key</span>
                            <span>Stored Password: <strong style="color:var(--text-primary); font-family:monospace;">${inst.password}</strong></span>
                        </span>
                    </div>
                    <div style="display:flex; gap:10px;">
                        <div class="input-field" style="flex:1; height:32px;">
                            <span class="material-symbols-outlined input-icon" style="font-size:15px; left:8px;">lock_reset</span>
                            <input type="text" class="input-sa-new-pwd" placeholder="New password" style="font-size:12px; padding-left:28px; height:100%; border:none; outline:none; background:transparent; color:var(--text-primary); width:100%;">
                        </div>
                        <button class="btn btn-secondary btn-sa-update-pwd" data-tenant="${inst.tenantId}" data-email="${inst.email}" data-oldpwd="${inst.password}" style="height:32px; padding:0 12px; font-size:12px; font-weight:600; display:flex; align-items:center; gap:4px;">
                            <span class="material-symbols-outlined" style="font-size:14px;">vpn_key</span>
                            <span>Update Password</span>
                        </button>
                    </div>
                </div>
            `;
            listContainer.appendChild(card);
        });
    }

    function hexToRgb(hex) {
        hex = hex.replace('#','');
        if (hex.length === 3) {
            hex = hex[0]+hex[0] + hex[1]+hex[1] + hex[2]+hex[2];
        }
        const r = parseInt(hex.substring(0,2), 16);
        const g = parseInt(hex.substring(2,4), 16);
        const b = parseInt(hex.substring(4,6), 16);
        return isNaN(r) || isNaN(g) || isNaN(b) ? "99, 102, 241" : `${r}, ${g}, ${b}`;
    }
});
