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
        students: "Student Enrollment Hub",
        settings: "System Settings",
        reports: "Reports Hub"
    };

    function switchView(targetView) {
        // Enforce user role authorization limits
        if (targetView === "payroll" && AuraStore.getUserRole() !== "admin") {
            targetView = "dashboard";
        }

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
        } else if (viewName === "students") {
            refreshStudents();
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
            triggerAutoSync();
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
        if (activeReportTab === "students") {
            populateReportCoursesFilter();
        }
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
            triggerAutoSync();
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
                    triggerAutoSync();
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
            const branch = $("#student-branch").value;
            const courseFee = Number($("#student-course-fee").value);
            const amountReceived = Number($("#student-amount-received").value);
            const dueAmount = Number($("#student-due-amount").value);
            const dueDate = $("#student-due-date").value;
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

            if (name === "" || mobile === "" || selectedCourses.length === 0 || !branch || isNaN(amountReceived) || amountReceived < 0) {
                AuraDOM.showToast("Please fill all mandatory fields and select at least one course.", "error");
                return;
            }

            if (feeTypes.length === 0) {
                AuraDOM.showToast("Please select at least one Fee Type.", "error");
                return;
            }

            const studentData = {
                name,
                mobile,
                course,
                branch,
                courseFee,
                amountReceived,
                dueAmount,
                dueDate,
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

                triggerAutoSync();
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
        document.querySelectorAll('input[name="fee-type-cb"]').forEach(cb => {
            cb.checked = false;
        });
        document.querySelectorAll('input[name="student-course-cb"]').forEach(cb => {
            cb.checked = false;
        });
        $("#student-course-fee").value = 0;
        $("#student-due-amount").value = 0;
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

            if (editBtn) {
                const id = editBtn.dataset.id;
                const students = AuraStore.getStudents();
                const student = students.find(s => s.id === id);
                if (student) {
                    // Load values into form
                    $("#student-edit-id").value = student.id;
                    $("#student-name").value = student.name;
                    $("#student-mobile").value = student.mobile || "";
                    $("#student-branch").value = student.branch;
                    $("#student-course-fee").value = student.courseFee;
                    $("#student-amount-received").value = student.amountReceived;
                    $("#student-due-amount").value = student.dueAmount || 0;
                    $("#student-due-date").value = student.dueDate || "";
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
                    triggerAutoSync();
                }
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
        if (confirm("WARNING: This will permanently wipe all staff files, schedules, payroll ledger, and student records locally. If sync is configured, it will also clear all data in your Google Sheets. Proceed?")) {
            AuraDOM.showToast("Wiping databases...", "warning");
            AuraStore.wipeAllData();
            
            const urlStaff = AuraStore.getSheetsUrlStaff();
            const urlAttendance = AuraStore.getSheetsUrlAttendance();
            const syncStaff = AuraStore.getSyncStaff();
            const syncAttendance = AuraStore.getSyncAttendance();
            
            let pendingWipes = 0;
            
            function wipeDone() {
                pendingWipes--;
                if (pendingWipes <= 0) {
                    AuraDOM.showToast("Local and Google Sheets databases wiped successfully!", "success");
                    setTimeout(() => {
                        window.location.reload();
                    }, 1200);
                }
            }
            
            if (syncStaff && urlStaff) {
                pendingWipes++;
                const payload = {
                    branding: AuraStore.getBranding(),
                    staff: [],
                    payroll: {},
                    students: [],
                    courses: [],
                    options: {
                        syncStaff: true,
                        syncAttendance: false
                    }
                };
                AuraStore.postPayload(urlStaff, payload, wipeDone);
            }
            
            if (syncAttendance && urlAttendance) {
                pendingWipes++;
                const payload = {
                    branding: AuraStore.getBranding(),
                    staff: [],
                    attendance: {},
                    students: [],
                    courses: [],
                    options: {
                        syncStaff: false,
                        syncAttendance: true
                    }
                };
                AuraStore.postPayload(urlAttendance, payload, wipeDone);
            }
            
            if (pendingWipes === 0) {
                AuraDOM.showToast("Local databases reset successfully.", "success");
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
            }
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
        if (syncStaff && urlStaff.includes("docs.google.com/spreadsheets")) {
            AuraDOM.showToast("Faculty Sync URL is a spreadsheet link! Please paste the Apps Script Web App URL (ending in /exec) instead.", "error");
            return;
        }
        if (syncAttendance && urlAttendance === "") {
            AuraDOM.showToast("Please enter your Attendance Log Sync URL first.", "error");
            return;
        }
        if (syncAttendance && urlAttendance.includes("docs.google.com/spreadsheets")) {
            AuraDOM.showToast("Attendance Sync URL is a spreadsheet link! Please paste the Apps Script Web App URL (ending in /exec) instead.", "error");
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
    function applyRolePrivileges() {
        const role = AuraStore.getUserRole();
        if (role === "admin") {
            $("#menu-payroll").classList.remove("hide");
            $("#card-payroll-stat").classList.remove("hide");
            $("#tile-payroll").classList.remove("hide");
            $("#section-salary-banking-header").classList.remove("hide");
            $("#section-salary-banking-fields").classList.remove("hide");
            $("#report-tab-payroll").classList.remove("hide");
        } else {
            $("#menu-payroll").classList.add("hide");
            $("#card-payroll-stat").classList.add("hide");
            $("#tile-payroll").classList.add("hide");
            $("#section-salary-banking-header").classList.add("hide");
            $("#section-salary-banking-fields").classList.add("hide");
            $("#report-tab-payroll").classList.add("hide");
            
            // Redirect to dashboard if clerk somehow lands on payroll view
            if (currentView === "payroll") {
                switchView("dashboard");
            }

            if (activeReportTab === "payroll") {
                activeReportTab = "faculty";
                const tabFac = $("#report-tab-faculty");
                if (tabFac) {
                    $$(".report-tab-btn").forEach(b => {
                        b.classList.remove("btn-primary");
                        b.classList.add("btn-outline");
                    });
                    tabFac.classList.add("btn-primary");
                    tabFac.classList.remove("btn-outline");
                }
                const fgFac = $("#filter-group-faculty");
                if (fgFac) {
                    $$(".filter-group-row").forEach(fg => fg.classList.add("hide"));
                    fgFac.classList.remove("hide");
                }
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
                $(`#filter-group-${targetTab}`).classList.remove("hide");
                
                activeReportTab = targetTab;
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
