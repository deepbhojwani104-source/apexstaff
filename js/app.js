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
        const hasFirebaseConfig = localStorage.getItem("aurastaff_firebase_config") !== null;
        if (!hasFirebaseConfig) {
            $("#firebase-setup-container").classList.remove("hide");
            $("#login-container").classList.add("hide");
            $("#app-container").classList.add("hide");
            initFirebaseSetupForm();
            return;
        }

        $("#firebase-setup-container").classList.add("hide");

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
        } else if (targetView === "payroll" && role !== "admin") {
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
        updateSyncStatusIndicator();
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

    // Auto-update dues pending on received input
    const receivedInput = $("#student-amount-received");
    if (receivedInput) {
        receivedInput.addEventListener("input", function() {
            const courseFee = Number($("#student-course-fee").value) || 0;
            const received = Number(this.value) || 0;
            $("#student-due-amount").value = Math.max(0, courseFee - received);
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
            const courseFee = Number($("#student-course-fee").value);
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
                    $("#student-course-fee").value = student.courseFee;
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
        const indicator = $("#sync-status-indicator");
        if (!indicator) return;
        const icon = indicator.querySelector(".status-icon");
        const text = indicator.querySelector(".status-text");

        indicator.classList.remove("hide"); // Always show database status

        if (!AuraStore.useFirebase) {
            indicator.className = "sync-status-badge error";
            if (icon) icon.textContent = "cloud_off";
            if (text) text.textContent = "Disconnected";
        } else if (!navigator.onLine) {
            indicator.className = "sync-status-badge syncing";
            if (icon) icon.textContent = "cloud_queue";
            if (text) text.textContent = "Offline Cache";
        } else {
            indicator.className = "sync-status-badge";
            if (icon) icon.textContent = "cloud_done";
            if (text) text.textContent = "Connected (Real-time)";
        }
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
                if (view === "payroll" && role !== "admin") {
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
                if (avatar) avatar.textContent = "AD";
                if (uName) uName.textContent = "Administrator";
                if (uRole) uRole.textContent = "Super Admin";
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
        console.log("ApexStaff was installed successfully!");
        AuraDOM.showToast("ApexStaff successfully installed on your desktop!", "success");
        if (installRow) installRow.classList.add("hide");
        if (installedRow) installedRow.classList.remove("hide");
    });
});
