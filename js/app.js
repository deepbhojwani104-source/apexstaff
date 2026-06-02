/* ==========================================================================
   AURASTAFF: CORE APP CONTROL CONTROLLER
   ========================================================================== */

document.addEventListener("DOMContentLoaded", function() {
    // Shorthand query helper
    const $ = selector => document.querySelector(selector);
    const $$ = selector => document.querySelectorAll(selector);

    // Initial state loading
    AuraStore.loadState();

    // ==========================================================================
    // 1. Session Auth Logic & Initialization
    // ==========================================================================
    function checkAuth() {
        if (AuraStore.isLoggedIn()) {
            $("#login-container").classList.add("hide");
            $("#app-container").classList.remove("hide");
            initApp();
        } else {
            $("#login-container").classList.remove("hide");
            $("#app-container").classList.add("hide");
        }
    }

    // Login Form Submit handler
    $("#login-form").addEventListener("submit", function(e) {
        e.preventDefault();
        const username = $("#username").value.trim();
        const password = $("#password").value.trim();
        
        const success = AuraStore.login(username, password);
        if (success) {
            $("#login-error").classList.add("hide");
            checkAuth();
            AuraDOM.showToast("Logged in successfully as Administrator", "success");
        } else {
            const errorBlock = $("#login-error");
            errorBlock.classList.remove("hide");
            errorBlock.classList.add("shake");
            setTimeout(() => errorBlock.classList.remove("shake"), 300);
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
        attendance: "Daily Attendance Log",
        payroll: "Payroll Hub",
        settings: "System Settings"
    };

    function switchView(targetView) {
        currentView = targetView;
        
        // Hide all views, display the selected target view
        $$(".page-view").forEach(view => view.classList.add("hide"));
        $(`#view-${targetView}`).classList.remove("hide");

        // Toggle Sidebar menu states
        $$(".menu-item").forEach(item => {
            if (item.dataset.view === targetView) {
                item.classList.add("active");
            } else {
                item.classList.remove("active");
            }
        });

        // Set Top Header page title
        $("#page-title").textContent = viewTitles[targetView];

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
        } else if (viewName === "settings") {
            loadSettingsValues();
        }
    }

    // Custom Event trigger for live audit logs update on dashboard
    document.addEventListener('activityLogged', function() {
        if (currentView === "dashboard") {
            AuraDOM.renderDashboard();
        }
    });

    // ==========================================================================
    // 3. Theme Toggle Setup
    // ==========================================================================
    function initTheme() {
        const themeToggleBtn = $("#theme-toggle-btn");
        const currentTheme = localStorage.getItem("aurastaff_theme") || "dark";
        
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
            triggerAutoSync();
        } catch (error) {
            AuraDOM.showToast(error.message, "error");
        }
    });

    // Directory dynamic row clicks (EDIT, PROFILE detail card)
    $("#staff-directory-grid").addEventListener("click", function(e) {
        const editBtn = e.target.closest(".btn-edit-staff");
        const profileBtn = e.target.closest(".btn-view-profile");

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

                $("#modal-staff-title").textContent = `Edit Staff: ${emp.name}`;
                $("#modal-staff-form").classList.remove("hide");
            }
        }

        if (profileBtn) {
            const staffId = profileBtn.dataset.id;
            AuraDOM.renderStaffDetailModal(staffId);
            $("#modal-staff-detail").classList.remove("hide");
        }
    });

    // ==========================================================================
    // 6. Daily Attendance Sheet Interactions
    // ==========================================================================
    let currentAttendanceDate = new Date().toISOString().split('T')[0];

    function initAttendanceView() {
        const picker = $("#attendance-date-picker");
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
                
                // Pre-fill standard check in time if empty (e.g. 09:00 AM)
                const timeField = tr.querySelector(".table-input-time");
                if (timeField && timeField.value === "") {
                    timeField.value = "09:00";
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
            const remarks = tr.querySelector(".table-input-comment").value.trim();

            records[staffId] = { status, checkIn, remarks };
        });

        if (valid) {
            AuraStore.saveDailyAttendance(currentAttendanceDate, records);
            AuraDOM.showToast(`Daily log successfully updated for ${currentAttendanceDate}`, "success");
            AuraDOM.renderAttendanceTable(currentAttendanceDate);
            AuraDOM.renderDashboard();
            triggerAutoSync();
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
        
        AuraStore.calculatePayrollForMonth(currentPayrollYear, currentPayrollMonth);
        refreshPayroll();
        AuraDOM.showToast("Payroll calculations refreshed.", "success");
    });

    // Shortcut click from Dashboard tile
    $("#tile-payroll").addEventListener("click", () => {
        switchView("payroll");
    });

    // Bulk action approve all
    $("#btn-bulk-approve-payroll").addEventListener("click", () => {
        const state = AuraStore.getState();
        const activeStaff = state.staff.filter(s => s.status === "Active");
        if (activeStaff.length === 0) return;

        if (confirm("Are you sure you want to mark ALL calculated salary payouts as PAID for this month?")) {
            AuraStore.approveAllPayroll(currentPayrollYear, currentPayrollMonth);
            refreshPayroll();
            AuraDOM.showToast("All registers finalized as Paid.", "success");
            triggerAutoSync();
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
            triggerAutoSync();
        } catch (err) {
            AuraDOM.showToast(err.message, "error");
        }
    });

    // Print payslip button click
    $("#btn-print-payslip").addEventListener("click", () => {
        window.print();
    });

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

        // Set Google Sheets configuration parameters
        $("#settings-sheets-url-staff").value = AuraStore.getSheetsUrlStaff();
        $("#settings-sheets-url-attendance").value = AuraStore.getSheetsUrlAttendance();
        $("#settings-auto-sync").checked = AuraStore.getAutoSync();
        $("#settings-sync-staff").checked = AuraStore.getSyncStaff();
        $("#settings-sync-attendance").checked = AuraStore.getSyncAttendance();
        $("#google-script-template").value = AuraStore.GOOGLE_SCRIPT_TEMPLATE;
    }

    // Shortcut click from Dashboard tile
    $("#tile-settings").addEventListener("click", () => {
        switchView("settings");
    });

    // Branding info form submit handler
    $("#settings-branding-form").addEventListener("submit", function(e) {
        e.preventDefault();
        
        const newBranding = {
            name: $("#brand-name").value.trim(),
            tagline: $("#brand-tagline").value.trim(),
            email: $("#brand-email").value.trim(),
            phone: $("#brand-phone").value.trim(),
            address: $("#brand-address").value.trim()
        };

        AuraStore.updateBranding(newBranding);
        AuraDOM.showToast("Branding settings updated", "success");
        
        // Reflect branding name changes in sidebar brand label immediately
        $(".sidebar-brand h2").innerHTML = `${newBranding.name.split(" ")[0]}<span>Staff</span>`;
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
        if (confirm("WARNING: This will permanently wipe all staff files, schedules, and payroll ledger entries. Are you absolutely sure?")) {
            AuraStore.wipeAllData();
            AuraDOM.showToast("Databases wiped and reset.", "warning");
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

    // Google Sheets Sync Web API Clicks
    $("#btn-sync-sheets").addEventListener("click", () => {
        const urlStaff = $("#settings-sheets-url-staff").value.trim();
        const urlAttendance = $("#settings-sheets-url-attendance").value.trim();

        const syncStaff = AuraStore.getSyncStaff();
        const syncAttendance = AuraStore.getSyncAttendance();

        if (syncStaff && urlStaff === "") {
            AuraDOM.showToast("Please enter your Faculty Directory Sync URL first.", "error");
            return;
        }
        if (syncAttendance && urlAttendance === "") {
            AuraDOM.showToast("Please enter your Attendance Log Sync URL first.", "error");
            return;
        }

        AuraStore.setSheetsUrlStaff(urlStaff);
        AuraStore.setSheetsUrlAttendance(urlAttendance);
        
        // Show spinning/loading status
        const syncBtn = $("#btn-sync-sheets");
        const originalText = syncBtn.innerHTML;
        syncBtn.disabled = true;
        syncBtn.innerHTML = `<span class="material-symbols-outlined animated-spin" style="animation: spin 1.5s linear infinite;">sync</span> <span>Syncing...</span>`;
        
        AuraStore.syncAll(function(err, success) {
            syncBtn.disabled = false;
            syncBtn.innerHTML = originalText;
            
            if (success) {
                AuraDOM.showToast("Successfully synced databases with Google Sheets!", "success");
            } else {
                AuraDOM.showToast(`Sync failed: ${err}`, "error");
            }
        });
    });

    // Auto-sync setting change triggers
    $("#settings-auto-sync").addEventListener("change", function() {
        AuraStore.setAutoSync(this.checked);
        triggerAutoSync();
    });

    $("#settings-sync-staff").addEventListener("change", function() {
        AuraStore.setSyncStaff(this.checked);
    });

    $("#settings-sync-attendance").addEventListener("change", function() {
        AuraStore.setSyncAttendance(this.checked);
    });

    $("#settings-sheets-url-staff").addEventListener("input", function() {
        AuraStore.setSheetsUrlStaff(this.value.trim());
    });

    $("#settings-sheets-url-attendance").addEventListener("input", function() {
        AuraStore.setSheetsUrlAttendance(this.value.trim());
    });

    function triggerAutoSync() {
        const enabled = AuraStore.getAutoSync();
        const urlStaff = AuraStore.getSheetsUrlStaff();
        const urlAttendance = AuraStore.getSheetsUrlAttendance();
        
        const syncStaff = AuraStore.getSyncStaff();
        const syncAttendance = AuraStore.getSyncAttendance();
        
        const hasUrl = (syncStaff && urlStaff) || (syncAttendance && urlAttendance);
        const indicator = $("#sync-status-indicator");
        
        if (!enabled || !hasUrl) {
            indicator.classList.add("hide");
            return;
        }

        const icon = indicator.querySelector(".status-icon");
        const text = indicator.querySelector(".status-text");

        indicator.className = "sync-status-badge syncing";
        icon.textContent = "sync";
        icon.style.animation = "spin 1.2s linear infinite";
        text.textContent = "Syncing...";
        indicator.classList.remove("hide");

        AuraStore.syncAll(function(err, success) {
            icon.style.animation = "";
            if (success) {
                indicator.className = "sync-status-badge";
                icon.textContent = "cloud_done";
                text.textContent = "Cloud Synced";
            } else {
                indicator.className = "sync-status-badge error";
                icon.textContent = "cloud_off";
                text.textContent = "Sync Failed";
            }
        });
    }

    // Offline CSV Exporters
    $("#btn-export-staff-csv").addEventListener("click", () => {
        const csv = AuraStore.exportStaffCSV();
        downloadCSVFile(csv, "aurastaff_directory.csv");
        AuraDOM.showToast("Staff directory CSV downloaded", "success");
    });

    $("#btn-export-attend-csv").addEventListener("click", () => {
        const csv = AuraStore.exportAttendanceCSV();
        downloadCSVFile(csv, "aurastaff_attendance.csv");
        AuraDOM.showToast("Attendance records CSV downloaded", "success");
    });

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
    function initApp() {
        initTheme();
        initAttendanceView();
        initPayrollView();
        
        // Initial dashboard draw
        AuraDOM.renderDashboard();
        triggerAutoSync();

        // Bind escape key to close modals
        document.addEventListener("keydown", function(e) {
            if (e.key === "Escape") {
                $$(".modal-overlay").forEach(modal => modal.classList.add("hide"));
            }
        });
        
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
        console.log("ApexStaff was installed successfully!");
        AuraDOM.showToast("ApexStaff successfully installed on your desktop!", "success");
        if (installRow) installRow.classList.add("hide");
        if (installedRow) installedRow.classList.remove("hide");
    });
});
