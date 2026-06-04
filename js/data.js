/* ==========================================================================
   AURASTAFF: DATA LAYER
   ========================================================================== */

(function() {
    // Namespace check
    if (!window.AuraStore) {
        window.AuraStore = {};
    }

    // Default branding profile
    const DEFAULT_BRANDING = {
        name: "Samyak Computer Classes",
        tagline: "Unlocking Academic Excellence",
        email: "contact@samyak.edu",
        phone: "9876543210",
        address: "Above Pappu Restaurant, Chang Gate, Beawar"
    };

    // System State Container
    let state = {
        staff: [],
        attendance: {}, // Date string 'YYYY-MM-DD' => { staffId: { status, checkIn, checkOut, remarks } }
        payroll: {},    // 'YYYY-MM' => { staffId: { baseSalary, allowances, deductions, absentDeductions, netSalary, status, remarks } }
        students: [],
        courses: [],
        branding: { ...DEFAULT_BRANDING },
        logs: [],
        sheetsUrlStaff: "",
        sheetsUrlAttendance: "",
        autoSync: false,
        syncStaff: true,
        syncAttendance: true
    };

    // Keys for LocalStorage
    const STORAGE_KEY = "aurastaff_data_state";
    const SESSION_KEY = "aurastaff_logged_in";

    // 1. Initial State Loader
    AuraStore.loadState = function() {
        try {
            const rawData = localStorage.getItem(STORAGE_KEY);
            if (rawData) {
                const parsed = JSON.parse(rawData);
                
                // Migrate branding if it's the old default Apex Coaching Institute
                if (parsed.branding && (parsed.branding.name === "Apex Coaching Institute" || parsed.branding.name === "Apex Staffing")) {
                    parsed.branding = { ...DEFAULT_BRANDING };
                }
                
                state = {
                    staff: parsed.staff || [],
                    attendance: parsed.attendance || {},
                    payroll: parsed.payroll || {},
                    students: parsed.students || [],
                    courses: parsed.courses || [],
                    branding: parsed.branding || { ...DEFAULT_BRANDING },
                    logs: parsed.logs || [],
                    sheetsUrlStaff: parsed.sheetsUrlStaff || "",
                    sheetsUrlAttendance: parsed.sheetsUrlAttendance || "",
                    autoSync: parsed.autoSync || false,
                    syncStaff: parsed.syncStaff !== false,
                    syncAttendance: parsed.syncAttendance !== false
                };
            }
        } catch (e) {
            console.error("Error loading localStorage data", e);
            AuraStore.logActivity("Failed to load local storage state.", "danger");
        }
    };

    // 2. Save State to storage
    AuraStore.saveState = function() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (e) {
            console.error("Error saving state", e);
            AuraStore.logActivity("Error writing data to localStorage.", "danger");
        }
    };

    // 3. Activity Logging Utility
    AuraStore.logActivity = function(message, type = "info") {
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const logItem = {
            id: Date.now() + Math.random().toString(36).substr(2, 5),
            message,
            type,
            time: timestamp
        };
        state.logs.unshift(logItem);
        // Limit to 50 logs
        if (state.logs.length > 50) {
            state.logs.pop();
        }
        AuraStore.saveState();
        // Fire custom event to update dashboard UI immediately
        document.dispatchEvent(new CustomEvent('activityLogged'));
    };

    AuraStore.clearLogs = function() {
        state.logs = [];
        AuraStore.saveState();
        AuraStore.logActivity("System activity logs cleared.", "info");
    };

    // 4. Getter & Setter Methods
    AuraStore.getState = function() {
        return state;
    };

    AuraStore.getStaffList = function() {
        return state.staff;
    };

    AuraStore.getStaffById = function(id) {
        return state.staff.find(s => s.id === id);
    };

    AuraStore.getBranding = function() {
        return state.branding;
    };

    AuraStore.updateBranding = function(newBranding) {
        state.branding = { ...state.branding, ...newBranding };
        AuraStore.saveState();
        AuraStore.logActivity("Institutional brand details updated.", "success");
    };

    // Add Staff
    AuraStore.addStaff = function(staffObj) {
        // ID generation
        if (!staffObj.id) {
            const nextNum = state.staff.length > 0 
                ? Math.max(...state.staff.map(s => parseInt(s.id.split('-')[1]) || 1000)) + 1
                : 1001;
            staffObj.id = `APEX-${nextNum}`;
        }

        // Set default salaryType
        staffObj.salaryType = staffObj.salaryType || "Standard";

        // Validate duplicates
        if (state.staff.some(s => s.id === staffObj.id)) {
            throw new Error(`Staff with ID ${staffObj.id} already exists.`);
        }
        if (staffObj.email && state.staff.some(s => s.email && s.email.toLowerCase() === staffObj.email.toLowerCase())) {
            throw new Error(`Email ${staffObj.email} is already in use.`);
        }

        staffObj.lastUpdated = Date.now();
        state.staff.push(staffObj);
        AuraStore.saveState();
        AuraStore.logActivity(`Added staff member ${staffObj.name} (${staffObj.id})`, "success");
        return staffObj;
    };

    // Edit Staff
    AuraStore.updateStaff = function(id, updatedFields) {
        const index = state.staff.findIndex(s => s.id === id);
        if (index === -1) {
            throw new Error("Staff member not found.");
        }

        // Validate email uniqueness on change
        if (updatedFields.email && updatedFields.email.toLowerCase() !== (state.staff[index].email || '').toLowerCase()) {
            if (state.staff.some(s => s.email && s.email.toLowerCase() === updatedFields.email.toLowerCase() && s.id !== id)) {
                throw new Error(`Email ${updatedFields.email} is already in use.`);
            }
        }

        state.staff[index] = { ...state.staff[index], ...updatedFields, lastUpdated: Date.now() };
        AuraStore.saveState();
        AuraStore.logActivity(`Updated info for ${state.staff[index].name} (${id})`, "info");
        return state.staff[index];
    };

    // Delete Staff (Optional/Flag inactive instead, or hard delete)
    AuraStore.deleteStaff = function(id) {
        const staffIndex = state.staff.findIndex(s => s.id === id);
        if (staffIndex === -1) return;
        
        const name = state.staff[staffIndex].name;
        state.staff.splice(staffIndex, 1);
        
        // Clean attendance and payroll records references potentially? Usually we keep them for audit logs.
        
        AuraStore.saveState();
        AuraStore.logActivity(`Removed staff member ${name} (${id})`, "danger");
    };

    // 5. Attendance Management Operations
    AuraStore.getAttendanceByDate = function(dateStr) {
        return state.attendance[dateStr] || {};
    };

    AuraStore.saveDailyAttendance = function(dateStr, records) {
        // Records should be map: { staffId: { status, checkIn, checkOut, remarks } }
        Object.keys(records).forEach(staffId => {
            records[staffId].lastUpdated = Date.now();
        });
        state.attendance[dateStr] = records;
        AuraStore.saveState();
        AuraStore.logActivity(`Saved daily attendance sheet for ${dateStr}.`, "success");
    };

    // 6. Payroll Core Processing Formulas
    // Calculates working days stats & leaves details for an employee in a given month
    AuraStore.calculateStaffAttendanceStats = function(staffId, year, month) {
        const stats = {
            totalDays: 0,
            present: 0,
            late: 0,
            halfDay: 0,
            absent: 0,
            leave: 0
        };

        const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
        stats.totalDays = totalDaysInMonth;

        // Traverse attendance map for the matching Month and Year
        for (let day = 1; day <= totalDaysInMonth; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayRecord = state.attendance[dateStr];
            if (dayRecord && dayRecord[staffId]) {
                const status = dayRecord[staffId].status;
                if (status === "Present") stats.present++;
                else if (status === "Late") stats.late++;
                else if (status === "Half Day") stats.halfDay++;
                else if (status === "Absent") stats.absent++;
                else if (status === "Paid Leave") stats.leave++;
            } else {
                // If no record exists, we don't automatically penalize (treat as off/present or ignore)
                // Let's assume teaching centers operate all days except Sundays.
                // For simplicity, we only count days where attendance was actually marked.
            }
        }

        return stats;
    };

    // Calculates and processes payroll for a specific month YYYY-MM
    AuraStore.calculatePayrollForMonth = function(year, month, selectedIds, calcType) {
        const key = `${year}-${String(month + 1).padStart(2, '0')}`;
        
        // Initialize payroll object for this month if missing
        if (!state.payroll[key]) {
            state.payroll[key] = {};
        }

        const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
        const activeStaff = state.staff.filter(s => s.status === "Active");

        activeStaff.forEach(employee => {
            if (selectedIds && !selectedIds.includes(employee.id)) {
                return;
            }
            const attendStats = AuraStore.calculateStaffAttendanceStats(employee.id, year, month);
            
            let absentDeductions = 0;
            // calcType can be: "fixed" (no leaves deduction) or "standard" (deduct from salary) or default to profile setting
            const actualCalcType = (calcType === "fixed") ? "Fixed" : (calcType === "standard" ? "Standard" : (employee.salaryType || "Standard"));

            if (actualCalcType === "Fixed") {
                // Fixed pays full base salary regardless of attendance
                absentDeductions = 0;
            } else {
                // Standard pays pro-rata based on actual present/late/leave days
                const dailyRate = employee.baseSalary / totalDaysInMonth;
                const paidDays = attendStats.present + attendStats.late + attendStats.leave + (attendStats.halfDay * 0.5);
                const grossPay = dailyRate * paidDays;
                absentDeductions = Math.round(employee.baseSalary - grossPay);
            }

            // Load existing adjustment records if they exist to preserve manual additions
            const existingRecord = state.payroll[key][employee.id] || {};
            const allowances = existingRecord.allowances !== undefined ? existingRecord.allowances : 0;
            const manualDeductions = existingRecord.deductions !== undefined ? existingRecord.deductions : 0;
            const remarks = existingRecord.remarks || "";
            const paymentStatus = existingRecord.status || "Pending";

            const netSalary = Math.max(0, Math.round(employee.baseSalary + allowances - absentDeductions - manualDeductions));

            state.payroll[key][employee.id] = {
                baseSalary: employee.baseSalary,
                allowances,
                deductions: manualDeductions,
                absentDeductions,
                leavesCount: attendStats,
                netSalary,
                status: paymentStatus,
                remarks,
                lastUpdated: Date.now()
            };
        });

        AuraStore.saveState();
        AuraStore.logActivity(`Processed payroll calculations for month: ${key}`, "info");
        return state.payroll[key];
    };

    AuraStore.updatePayrollAdjustment = function(year, month, staffId, adjustments) {
        const key = `${year}-${String(month + 1).padStart(2, '0')}`;
        if (!state.payroll[key] || !state.payroll[key][staffId]) {
            throw new Error("Payroll is not yet processed for this period.");
        }

        const record = state.payroll[key][staffId];
        const updatedAllowances = adjustments.allowances !== undefined ? Number(adjustments.allowances) : record.allowances;
        const updatedDeductions = adjustments.deductions !== undefined ? Number(adjustments.deductions) : record.deductions;
        const updatedRemarks = adjustments.remarks !== undefined ? adjustments.remarks : record.remarks;
        const updatedStatus = adjustments.status !== undefined ? adjustments.status : record.status;

        // Recalculate net salary
        const netSalary = Math.max(0, Math.round(record.baseSalary + updatedAllowances - record.absentDeductions - updatedDeductions));

        state.payroll[key][staffId] = {
            ...record,
            allowances: updatedAllowances,
            deductions: updatedDeductions,
            remarks: updatedRemarks,
            status: updatedStatus,
            netSalary,
            lastUpdated: Date.now()
        };

        AuraStore.saveState();
        AuraStore.logActivity(`Updated salary adjustments for ${AuraStore.getStaffById(staffId).name} (${staffId}).`, "success");
    };

    AuraStore.approveAllPayroll = function(year, month, selectedIds) {
        const key = `${year}-${String(month + 1).padStart(2, '0')}`;
        if (!state.payroll[key]) return;

        const idsToApprove = selectedIds || Object.keys(state.payroll[key]);

        idsToApprove.forEach(staffId => {
            if (state.payroll[key][staffId]) {
                state.payroll[key][staffId].status = "Paid";
                state.payroll[key][staffId].lastUpdated = Date.now();
            }
        });

        AuraStore.saveState();
        AuraStore.logActivity(`Approved and finalized payroll registers for ${key}.`, "success");
    };

    // 7. Backup Export & Import Tools
    AuraStore.exportDataJSON = function() {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `aurastaff_backup_${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        AuraStore.logActivity("Database backup exported successfully.", "success");
    };

    AuraStore.importDataJSON = function(jsonFile, callback) {
        const reader = new FileReader();
        reader.onload = function(event) {
            try {
                const parsed = JSON.parse(event.target.result);
                if (parsed.staff && parsed.attendance && parsed.payroll) {
                    state = {
                        staff: parsed.staff || [],
                        attendance: parsed.attendance || {},
                        payroll: parsed.payroll || {},
                        branding: parsed.branding || { ...DEFAULT_BRANDING },
                        logs: parsed.logs || []
                    };
                    AuraStore.saveState();
                    AuraStore.logActivity("Database backup restored successfully.", "success");
                    if (callback) callback(null, true);
                } else {
                    throw new Error("Invalid database schema. Missing core tables.");
                }
            } catch (e) {
                console.error("Backup load failure", e);
                AuraStore.logActivity("Backup file structure check failed.", "danger");
                if (callback) callback(e, false);
            }
        };
        reader.readAsText(jsonFile);
    };

    AuraStore.wipeAllData = function() {
        state = {
            staff: [],
            attendance: {},
            payroll: {},
            students: [],
            courses: [],
            branding: { ...DEFAULT_BRANDING },
            logs: []
        };
        AuraStore.saveState();
        AuraStore.logActivity("All databases reset and storage purged.", "warning");
    };

    // 8. Demo Prepopulation Database Seeding
    AuraStore.seedDemoData = function() {
        // Setup realistic Staff list
        const demoStaff = [
            {
                id: "APEX-1001",
                name: "Dr. Rajesh Kumar",
                email: "rajesh.kumar@apex.edu",
                phone: "9810234567",
                gender: "Male",
                department: "Teaching",
                designation: "Senior Physics Faculty",
                joiningDate: "2024-02-10",
                status: "Active",
                baseSalary: 65000,
                bankName: "State Bank of India",
                bankAccount: "30501234567",
                bankIfsc: "SBIN0001234"
            },
            {
                id: "APEX-1002",
                name: "Sunita Sharma",
                email: "sunita.sharma@apex.edu",
                phone: "9876543211",
                gender: "Female",
                department: "Teaching",
                designation: "Chemistry Head Lecturer",
                joiningDate: "2024-05-15",
                status: "Active",
                baseSalary: 62000,
                bankName: "HDFC Bank",
                bankAccount: "5010022334455",
                bankIfsc: "HDFC0000088"
            },
            {
                id: "APEX-1003",
                name: "Vikram Malhotra",
                email: "v.malhotra@apex.edu",
                phone: "9911223344",
                gender: "Male",
                department: "Administration",
                designation: "Coaching Center Manager",
                joiningDate: "2023-11-01",
                status: "Active",
                baseSalary: 48000,
                bankName: "ICICI Bank",
                bankAccount: "000401567890",
                bankIfsc: "ICIC0000004"
            },
            {
                id: "APEX-1004",
                name: "Preeti Singh",
                email: "preeti.singh@apex.edu",
                phone: "9560123456",
                gender: "Female",
                department: "Marketing",
                designation: "Admissions Counselor",
                joiningDate: "2025-01-20",
                status: "Active",
                baseSalary: 28000,
                bankName: "Axis Bank",
                bankAccount: "9150100223344",
                bankIfsc: "UTIB0000021"
            },
            {
                id: "APEX-1005",
                name: "Amit Rawat",
                email: "amit.rawat@apex.edu",
                phone: "9123456789",
                gender: "Male",
                department: "Support",
                designation: "Lab Assistant & Tech Support",
                joiningDate: "2025-03-05",
                status: "Active",
                baseSalary: 7000,
                salaryType: "Fixed",
                bankName: "Punjab National Bank",
                bankAccount: "12340015000987",
                bankIfsc: "PUNB0123400"
            },
            {
                id: "APEX-1006",
                name: "Karan Johar",
                email: "karan.j@apex.edu",
                phone: "9999111222",
                gender: "Male",
                department: "Teaching",
                designation: "Mathematics Instructor",
                joiningDate: "2025-06-01",
                status: "Inactive",
                baseSalary: 55000,
                bankName: "HDFC Bank",
                bankAccount: "5010044556677",
                bankIfsc: "HDFC0000088"
            }
        ];

        state.staff = demoStaff;

        // Generate attendance for the past 5 days (assuming date is around June 2, 2026)
        const dateList = ["2026-05-28", "2026-05-29", "2026-05-30", "2026-06-01", "2026-06-02"];
        const attendanceOptions = ["Present", "Present", "Present", "Late", "Half Day", "Absent", "Paid Leave"];

        dateList.forEach(d => {
            const records = {};
            // Only seed active employees
            demoStaff.filter(s => s.status === "Active").forEach(emp => {
                // Weighted statuses
                let status = "Present";
                let checkIn = "08:50";
                let remarks = "On time";

                const rand = Math.random();
                if (rand > 0.9) {
                    status = "Absent";
                    checkIn = "";
                    remarks = "Family medical emergency";
                } else if (rand > 0.8) {
                    status = "Half Day";
                    checkIn = "13:00";
                    remarks = "Left early with permission";
                } else if (rand > 0.7) {
                    status = "Late";
                    checkIn = "09:25";
                    remarks = "Heavy traffic delays";
                } else if (rand > 0.65) {
                    status = "Paid Leave";
                    checkIn = "";
                    remarks = "Sick leave approved";
                }

                records[emp.id] = { status, checkIn, remarks };
            });
            state.attendance[d] = records;
        });

        // Calculate and Seed payroll for May 2026 (Year 2026, MonthIndex 4)
        AuraStore.calculatePayrollForMonth(2026, 4);

        // Modify some payroll variables for variation
        const payMayKey = "2026-05";
        if (state.payroll[payMayKey]) {
            // Apply a bonus to Apex-1001
            if (state.payroll[payMayKey]["APEX-1001"]) {
                state.payroll[payMayKey]["APEX-1001"].allowances = 5000;
                state.payroll[payMayKey]["APEX-1001"].remarks = "Special batch target bonus";
                state.payroll[payMayKey]["APEX-1001"].status = "Paid";
                // Recalculate
                const rec = state.payroll[payMayKey]["APEX-1001"];
                rec.netSalary = rec.baseSalary + rec.allowances - rec.absentDeductions - rec.deductions;
            }
            // Set another to paid
            if (state.payroll[payMayKey]["APEX-1003"]) {
                state.payroll[payMayKey]["APEX-1003"].status = "Paid";
            }
        }

        // Default courses
        state.courses = [
            { name: "Python", price: 8000, lastUpdated: Date.now() },
            { name: "AI", price: 12000, lastUpdated: Date.now() },
            { name: "ML", price: 15000, lastUpdated: Date.now() }
        ];

        // Default students
        state.students = [
            {
                id: "STU-1001",
                name: "Rohan Verma",
                mobile: "9876543210",
                course: "Python",
                branch: "Beawar",
                courseFee: 8000,
                amountReceived: 5000,
                dueAmount: 3000,
                dueDate: "2026-06-15",
                feeType: ["New Registration", "Registration Fee"],
                remarks: "Wants to clear remaining dues next week.",
                lastUpdated: Date.now()
            },
            {
                id: "STU-1002",
                name: "Anjali Gupta",
                mobile: "9988776655",
                course: "AI",
                branch: "Beawar",
                courseFee: 12000,
                amountReceived: 12000,
                dueAmount: 0,
                dueDate: "",
                feeType: ["New Registration"],
                remarks: "Paid full fees up front.",
                lastUpdated: Date.now()
            }
        ];

        AuraStore.saveState();
        AuraStore.logActivity("Demo databases populated with realistic records.", "success");
    };

    // Course Master operations
    AuraStore.getCourses = function() {
        return state.courses || [];
    };

    AuraStore.addCourse = function(courseObj) {
        courseObj.lastUpdated = Date.now();
        if (!state.courses) state.courses = [];
        const existing = state.courses.find(c => c.name.toLowerCase() === courseObj.name.toLowerCase());
        if (existing) {
            existing.price = courseObj.price;
            existing.lastUpdated = Date.now();
        } else {
            state.courses.push(courseObj);
        }
        AuraStore.saveState();
        AuraStore.logActivity(`Course ${courseObj.name} configured with price ₹${courseObj.price}`, "success");
    };

    AuraStore.deleteCourse = function(name) {
        if (!state.courses) return;
        const index = state.courses.findIndex(c => c.name === name);
        if (index !== -1) {
            state.courses.splice(index, 1);
            AuraStore.saveState();
            AuraStore.logActivity(`Removed course ${name}.`, "danger");
        }
    };

    // Student Enrollment operations
    AuraStore.getStudents = function() {
        return state.students || [];
    };

    AuraStore.addStudent = function(studentObj) {
        if (!state.students) state.students = [];
        if (!studentObj.id) {
            const nextNum = state.students.length > 0
                ? Math.max(...state.students.map(s => parseInt(s.id.split('-')[1]) || 1000)) + 1
                : 1001;
            studentObj.id = `STU-${nextNum}`;
        }
        studentObj.lastUpdated = Date.now();
        state.students.push(studentObj);
        AuraStore.saveState();
        AuraStore.logActivity(`Enrolled student ${studentObj.name} (${studentObj.id}) for ${studentObj.course}`, "success");
        return studentObj;
    };

    AuraStore.updateStudent = function(id, updatedFields) {
        if (!state.students) return;
        const index = state.students.findIndex(s => s.id === id);
        if (index === -1) {
            throw new Error("Student not found.");
        }
        updatedFields.lastUpdated = Date.now();
        state.students[index] = { ...state.students[index], ...updatedFields };
        AuraStore.saveState();
        AuraStore.logActivity(`Updated details for student ${state.students[index].name} (${id})`, "info");
        return state.students[index];
    };

    AuraStore.deleteStudent = function(id) {
        if (!state.students) return;
        const index = state.students.findIndex(s => s.id === id);
        if (index === -1) return;
        const name = state.students[index].name;
        state.students.splice(index, 1);
        AuraStore.saveState();
        AuraStore.logActivity(`Removed student ${name} (${id})`, "danger");
    };

    // 9. Session Authentication Gateways
    const ROLE_KEY = "aurastaff_user_role";

    AuraStore.isLoggedIn = function() {
        return sessionStorage.getItem(SESSION_KEY) === "true";
    };

    AuraStore.getUserRole = function() {
        return sessionStorage.getItem(ROLE_KEY) || "staff";
    };

    AuraStore.login = function(username, password) {
        if (username === "admin" && password === "admin123") {
            sessionStorage.setItem(SESSION_KEY, "true");
            sessionStorage.setItem(ROLE_KEY, "admin");
            AuraStore.logActivity("Administrator session authenticated.", "success");
            return true;
        } else if (username === "clerk" && password === "clerk123") {
            sessionStorage.setItem(SESSION_KEY, "true");
            sessionStorage.setItem(ROLE_KEY, "staff");
            AuraStore.logActivity("Staff session authenticated.", "success");
            return true;
        }
        AuraStore.logActivity(`Failed login attempt for user: ${username}`, "warning");
        return false;
    };

    AuraStore.logout = function() {
        sessionStorage.removeItem(SESSION_KEY);
        sessionStorage.removeItem(ROLE_KEY);
        AuraStore.logActivity("Session terminated.", "info");
    };

    // 10. Google Sheets URL Configuration
    AuraStore.getSheetsUrlStaff = function() {
        return "https://script.google.com/macros/s/AKfycbyZB6qhhKaWtgMwU-K39nIpy3dcALX31nZR9Sz1z_qUaRfSZTwuXfEtRC4EWX3pNEl6/exec";
    };

    AuraStore.setSheetsUrlStaff = function(url) {
        // Hardcoded, no-op
    };

    AuraStore.getSheetsUrlAttendance = function() {
        return "https://script.google.com/macros/s/AKfycbz9POgB-0p2R2HmDmToSYU2Y7qCFNlwL5OQbBSJs1dVnHJp5-JvrXmx5syPs15duk-I/exec";
    };

    AuraStore.setSheetsUrlAttendance = function(url) {
        // Hardcoded, no-op
    };

    AuraStore.getAutoSync = function() {
        return state.autoSync || false;
    };

    AuraStore.setAutoSync = function(enabled) {
        state.autoSync = !!enabled;
        AuraStore.saveState();
        AuraStore.logActivity(`Google Sheets Auto-Sync toggled to ${state.autoSync ? 'Enabled' : 'Disabled'}.`, "info");
    };

    AuraStore.getSyncStaff = function() {
        return state.syncStaff !== false;
    };

    AuraStore.setSyncStaff = function(enabled) {
        state.syncStaff = !!enabled;
        AuraStore.saveState();
        AuraStore.logActivity(`Google Sheets Staff Sync option toggled to ${state.syncStaff ? 'Enabled' : 'Disabled'}.`, "info");
    };

    AuraStore.getSyncAttendance = function() {
        return state.syncAttendance !== false;
    };

    AuraStore.setSyncAttendance = function(enabled) {
        state.syncAttendance = !!enabled;
        AuraStore.saveState();
        AuraStore.logActivity(`Google Sheets Attendance Sync option toggled to ${state.syncAttendance ? 'Enabled' : 'Disabled'}.`, "info");
    };

    // 11. CSV Formatting Exporters
    AuraStore.exportStaffCSV = function() {
        let csv = "Staff ID,Name,Email,Phone,Gender,Department,Designation,Joining Date,Status,Base Salary,Salary Type,Bank Name,Account No,IFSC\n";
        state.staff.forEach(s => {
            csv += `"${s.id}","${s.name}","${s.email}","${s.phone}","${s.gender || ''}","${s.department}","${s.designation}","${s.joiningDate}","${s.status}",${s.baseSalary},"${s.salaryType || 'Standard'}","${s.bankName || ''}","${s.bankAccount || ''}","${s.bankIfsc || ''}"\n`;
        });
        return csv;
    };

    AuraStore.exportAttendanceCSV = function() {
        let csv = "Date,Staff ID,Name,Department,Designation,Status,Check-In Time,Remarks\n";
        
        // Map staff list for fast lookup
        const staffMap = {};
        state.staff.forEach(s => staffMap[s.id] = s);

        Object.keys(state.attendance).sort().forEach(dateStr => {
            const records = state.attendance[dateStr];
            Object.keys(records).forEach(staffId => {
                const rec = records[staffId];
                const s = staffMap[staffId] || { name: "", department: "", designation: "" };
                csv += `"${dateStr}","${staffId}","${s.name}","${s.department}","${s.designation}","${rec.status}","${rec.checkIn || ''}","${rec.remarks || ''}"\n`;
            });
        });
        return csv;
    };

    // 12. Google Sheets Web App Synchronization API Call
    AuraStore.postPayload = function(url, payload, callback) {
        fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "text/plain;charset=utf-8"
            },
            body: JSON.stringify(payload)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
        .then(result => {
            if (result && result.success) {
                AuraStore.logActivity("Successfully pushed data to Google Sheet.", "success");
                if (callback) callback(null);
            } else {
                const errMsg = result ? result.error || result.message : "Unknown error";
                AuraStore.logActivity(`Google Sheet Sync Error: ${errMsg}`, "danger");
                if (callback) callback(errMsg);
            }
        })
        .catch(error => {
            console.error("Sync URL error:", error);
            AuraStore.logActivity(`Sync Failed: ${error.message}. Ensure your URL is a deployed Web App URL and NOT a spreadsheet link.`, "danger");
            if (callback) callback(error.message);
        });
    };

    AuraStore.syncAll = function(callback) {
        const syncStaff = AuraStore.getSyncStaff();
        const syncAttendance = AuraStore.getSyncAttendance();
        const urlStaff = AuraStore.getSheetsUrlStaff();
        const urlAttendance = AuraStore.getSheetsUrlAttendance();

        let pendingPulls = 0;
        let pullErrors = [];
        let pulledStaff = [];
        let pulledAttendance = {};
        let pulledPayroll = {};
        let pulledStudents = [];
        let pulledCourses = [];

        if (syncStaff && urlStaff) pendingPulls++;
        if (syncAttendance && urlAttendance) pendingPulls++;

        if (pendingPulls === 0) {
            if (callback) callback("No active sync URLs configured or selected in options.", false);
            return;
        }

        // Helper to perform POST push after pulling and merging
        function pushMergedState() {
            let pendingPushes = 0;
            let pushErrors = [];

            if (syncStaff && urlStaff) pendingPushes++;
            if (syncAttendance && urlAttendance) pendingPushes++;

            function pushDone(err) {
                if (err) pushErrors.push(err);
                pendingPushes--;
                if (pendingPushes === 0) {
                    if (pushErrors.length > 0) {
                        if (callback) callback("Push failed: " + pushErrors.join(", "), false);
                    } else {
                        if (callback) callback(null, true);
                    }
                }
            }

            if (syncStaff && urlStaff) {
                const payload = {
                    branding: state.branding,
                    staff: state.staff,
                    payroll: state.payroll,
                    students: state.students,
                    courses: state.courses,
                    options: {
                        syncStaff: true,
                        syncAttendance: false
                    }
                };
                AuraStore.postPayload(urlStaff, payload, pushDone);
            }

            if (syncAttendance && urlAttendance) {
                const payload = {
                    branding: state.branding,
                    staff: state.staff,
                    attendance: state.attendance,
                    students: state.students,
                    courses: state.courses,
                    options: {
                        syncStaff: false,
                        syncAttendance: true
                    }
                };
                AuraStore.postPayload(urlAttendance, payload, pushDone);
            }
        }

        // Helper to merge pulled data into local state
        function mergeData() {
            // 1. Merge Staff list
            if (pulledStaff && pulledStaff.length > 0) {
                // Deduplicate pulled staff by id, keeping the one with the latest lastUpdated
                const dedupedPulledStaffMap = {};
                pulledStaff.forEach(s => {
                    if (s && s.id) {
                        if (s.joiningDate) {
                            const parsedDate = new Date(s.joiningDate);
                            if (!isNaN(parsedDate.getTime())) {
                                const y = parsedDate.getFullYear();
                                const m = String(parsedDate.getMonth() + 1).padStart(2, '0');
                                const d = String(parsedDate.getDate()).padStart(2, '0');
                                s.joiningDate = `${y}-${m}-${d}`;
                            }
                        }
                        const existing = dedupedPulledStaffMap[s.id];
                        if (!existing || (s.lastUpdated || 0) > (existing.lastUpdated || 0)) {
                            dedupedPulledStaffMap[s.id] = s;
                        }
                    }
                });
                const cleanPulledStaff = Object.values(dedupedPulledStaffMap);

                const localStaffMap = {};
                state.staff.forEach(s => localStaffMap[s.id] = s);

                const mergedStaff = [];
                const processedLocalIds = new Set();

                cleanPulledStaff.forEach(pulled => {
                    const local = localStaffMap[pulled.id];
                    if (local) {
                        const localTime = local.lastUpdated || 0;
                        const pulledTime = pulled.lastUpdated || 0;
                        if (pulledTime >= localTime) {
                            mergedStaff.push({
                                ...local,
                                ...pulled
                            });
                        } else {
                            mergedStaff.push(local);
                        }
                        processedLocalIds.add(pulled.id);
                    } else {
                        mergedStaff.push(pulled);
                    }
                });

                state.staff.forEach(s => {
                    if (!processedLocalIds.has(s.id)) {
                        mergedStaff.push(s);
                        processedLocalIds.add(s.id);
                    }
                });

                state.staff = mergedStaff;
            }

            // 2. Merge Attendance Logs
            if (pulledAttendance && Object.keys(pulledAttendance).length > 0) {
                Object.keys(pulledAttendance).forEach(dateStr => {
                    if (!state.attendance[dateStr]) {
                        state.attendance[dateStr] = pulledAttendance[dateStr];
                    } else {
                        const localRecords = state.attendance[dateStr];
                        const pulledRecords = pulledAttendance[dateStr];
                        
                        Object.keys(pulledRecords).forEach(staffId => {
                            const localRec = localRecords[staffId];
                            const pulledRec = pulledRecords[staffId];
                            if (!localRec) {
                                localRecords[staffId] = pulledRec;
                            } else {
                                const localTime = localRec.lastUpdated || 0;
                                const pulledTime = pulledRec.lastUpdated || 0;
                                if (pulledTime >= localTime) {
                                    localRecords[staffId] = {
                                        ...localRec,
                                        ...pulledRec
                                    };
                                }
                            }
                        });
                    }
                });
            }

            // 3. Merge Payroll
            if (pulledPayroll && Object.keys(pulledPayroll).length > 0) {
                const normalizedPulledPayroll = {};
                Object.keys(pulledPayroll).forEach(rawKey => {
                    let normKey = rawKey.trim();
                    const parsedDate = new Date(rawKey);
                    if (!isNaN(parsedDate.getTime())) {
                        const y = parsedDate.getFullYear();
                        const m = String(parsedDate.getMonth() + 1).padStart(2, '0');
                        normKey = `${y}-${m}`;
                    }
                    normalizedPulledPayroll[normKey] = pulledPayroll[rawKey];
                });

                Object.keys(normalizedPulledPayroll).forEach(monthKey => {
                    if (!state.payroll[monthKey]) {
                        state.payroll[monthKey] = normalizedPulledPayroll[monthKey];
                    } else {
                        const localMonth = state.payroll[monthKey];
                        const pulledMonth = normalizedPulledPayroll[monthKey];
                        Object.keys(pulledMonth).forEach(staffId => {
                            const localRec = localMonth[staffId];
                            const pulledRec = pulledMonth[staffId];
                            if (!localRec) {
                                localMonth[staffId] = pulledRec;
                            } else {
                                const localTime = localRec.lastUpdated || 0;
                                const pulledTime = pulledRec.lastUpdated || 0;
                                if (pulledTime >= localTime) {
                                    localMonth[staffId] = {
                                        ...localRec,
                                        ...pulledRec
                                    };
                                }
                            }
                        });
                    }
                });
            }

            // 4. Merge Students
            if (pulledStudents && pulledStudents.length > 0) {
                // Deduplicate pulled students by id, keeping the one with the latest lastUpdated
                const dedupedPulledStudentsMap = {};
                pulledStudents.forEach(s => {
                    if (s && s.id) {
                        if (s.dueDate) {
                            const parsedDate = new Date(s.dueDate);
                            if (!isNaN(parsedDate.getTime())) {
                                const y = parsedDate.getFullYear();
                                const m = String(parsedDate.getMonth() + 1).padStart(2, '0');
                                const d = String(parsedDate.getDate()).padStart(2, '0');
                                s.dueDate = `${y}-${m}-${d}`;
                            }
                        }
                        const existing = dedupedPulledStudentsMap[s.id];
                        if (!existing || (s.lastUpdated || 0) > (existing.lastUpdated || 0)) {
                            dedupedPulledStudentsMap[s.id] = s;
                        }
                    }
                });
                const cleanPulledStudents = Object.values(dedupedPulledStudentsMap);

                const localStudentsMap = {};
                if (!state.students) state.students = [];
                state.students.forEach(s => localStudentsMap[s.id] = s);

                const mergedStudents = [];
                const processedLocalIds = new Set();

                cleanPulledStudents.forEach(pulled => {
                    const local = localStudentsMap[pulled.id];
                    if (local) {
                        const localTime = local.lastUpdated || 0;
                        const pulledTime = pulled.lastUpdated || 0;
                        if (pulledTime >= localTime) {
                            mergedStudents.push({
                                ...local,
                                ...pulled
                            });
                        } else {
                            mergedStudents.push(local);
                        }
                        processedLocalIds.add(pulled.id);
                    } else {
                        mergedStudents.push(pulled);
                    }
                });

                state.students.forEach(s => {
                    if (!processedLocalIds.has(s.id)) {
                        mergedStudents.push(s);
                        processedLocalIds.add(s.id);
                    }
                });

                state.students = mergedStudents;
            }

            // 5. Merge Courses
            if (pulledCourses && pulledCourses.length > 0) {
                // Deduplicate pulled courses by name, keeping the one with the latest lastUpdated
                const dedupedPulledCoursesMap = {};
                pulledCourses.forEach(c => {
                    if (c && c.name) {
                        const nameKey = c.name.toLowerCase();
                        const existing = dedupedPulledCoursesMap[nameKey];
                        if (!existing || (c.lastUpdated || 0) > (existing.lastUpdated || 0)) {
                            dedupedPulledCoursesMap[nameKey] = c;
                        }
                    }
                });
                const cleanPulledCourses = Object.values(dedupedPulledCoursesMap);

                const localCoursesMap = {};
                if (!state.courses) state.courses = [];
                state.courses.forEach(c => localCoursesMap[c.name.toLowerCase()] = c);

                const mergedCourses = [];
                const processedLocalNames = new Set();

                cleanPulledCourses.forEach(pulled => {
                    const nameKey = pulled.name.toLowerCase();
                    const local = localCoursesMap[nameKey];
                    if (local) {
                        const localTime = local.lastUpdated || 0;
                        const pulledTime = pulled.lastUpdated || 0;
                        if (pulledTime >= localTime) {
                            mergedCourses.push({
                                ...local,
                                ...pulled
                            });
                        } else {
                            mergedCourses.push(local);
                        }
                        processedLocalNames.add(nameKey);
                    } else {
                        mergedCourses.push(pulled);
                    }
                });

                state.courses.forEach(c => {
                    const nameKey = c.name.toLowerCase();
                    if (!processedLocalNames.has(nameKey)) {
                        mergedCourses.push(c);
                        processedLocalNames.add(nameKey);
                    }
                });

                state.courses = mergedCourses;
            }

            AuraStore.saveState();
        }

        // Start pulling
        function pullDone(err, data, type) {
            if (err) {
                pullErrors.push(`${type}: ${err}`);
            } else if (data) {
                if (type === "staff" && data.staff) {
                    pulledStaff = data.staff;
                    pulledPayroll = data.payroll || {};
                    if (data.students && (pulledStudents.length === 0 || data.students.length > 0)) {
                        pulledStudents = data.students;
                    }
                    if (data.courses && (pulledCourses.length === 0 || data.courses.length > 0)) {
                        pulledCourses = data.courses;
                    }
                } else if (type === "attendance" && data.attendance) {
                    pulledAttendance = data.attendance;
                    if (data.students && (pulledStudents.length === 0 || data.students.length > 0)) {
                        pulledStudents = data.students;
                    }
                    if (data.courses && (pulledCourses.length === 0 || data.courses.length > 0)) {
                        pulledCourses = data.courses;
                    }
                }
            }

            pendingPulls--;
            if (pendingPulls === 0) {
                if (pullErrors.length > 0) {
                    console.warn("Pull errors occurred during sync, merging partial data:", pullErrors);
                }
                
                mergeData();
                pushMergedState();
            }
        }

        if (syncStaff && urlStaff) {
            fetch(urlStaff)
                .then(res => {
                    if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);
                    return res.json();
                })
                .then(data => pullDone(null, data, "staff"))
                .catch(err => pullDone(err.message, null, "staff"));
        }

        if (syncAttendance && urlAttendance) {
            fetch(urlAttendance)
                .then(res => {
                    if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);
                    return res.json();
                })
                .then(data => pullDone(null, data, "attendance"))
                .catch(err => pullDone(err.message, null, "attendance"));
        }
    };

    // Copyable Google Apps Script Template
    AuraStore.GOOGLE_SCRIPT_TEMPLATE = `function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = { success: true, staff: [], attendance: {}, payroll: {}, students: [], courses: [] };
  
  try {
    // 1. Read Faculty details from Sheet1
    var staffSheet = ss.getSheetByName("Sheet1") || ss.getSheets()[0];
    if (staffSheet) {
      var lastRow = staffSheet.getLastRow();
      if (lastRow > 1) {
        var staffRows = staffSheet.getRange(2, 1, lastRow - 1, 15).getValues();
        staffRows.forEach(function(row) {
          if (row[0]) {
            result.staff.push({
              id: String(row[0]),
              name: String(row[1]),
              joiningDate: row[2] instanceof Date ? Utilities.formatDate(row[2], Session.getScriptTimeZone(), "yyyy-MM-dd") : String(row[2]),
              department: String(row[3]),
              designation: String(row[4]),
              baseSalary: Number(row[5]),
              status: String(row[6]),
              email: String(row[7] || ""),
              phone: String(row[8] || ""),
              gender: String(row[9] || "Male"),
              salaryType: String(row[10] || "Standard"),
              bankName: String(row[11] || ""),
              bankAccount: String(row[12] || ""),
              bankIfsc: String(row[13] || ""),
              lastUpdated: row[14] ? Number(row[14]) : Date.now()
            });
          }
        });
      }
    }
    
    // 2. Read Attendance logs from Attendance tab
    var attendSheet = ss.getSheetByName("Attendance");
    if (attendSheet) {
      var lastRow = attendSheet.getLastRow();
      if (lastRow > 1) {
        var attendRows = attendSheet.getRange(2, 1, lastRow - 1, 7).getValues();
        attendRows.forEach(function(row) {
          if (row[0] && row[2]) {
            var staffId = String(row[0]);
            var dateStr = row[2] instanceof Date ? Utilities.formatDate(row[2], Session.getScriptTimeZone(), "yyyy-MM-dd") : String(row[2]);
            var checkIn = String(row[3] || "");
            var checkOut = String(row[4] || "");
            var status = String(row[5]);
            var remarks = String(row[6] || "");
            
            if (!result.attendance[dateStr]) {
              result.attendance[dateStr] = {};
            }
            result.attendance[dateStr][staffId] = {
              status: status,
              checkIn: checkIn,
              checkOut: checkOut,
              remarks: remarks,
              lastUpdated: Date.now()
            };
          }
        });
      }
    }

    // 3. Read Payroll registers from Payroll tab
    var payrollSheet = ss.getSheetByName("Payroll");
    if (payrollSheet) {
      var lastRow = payrollSheet.getLastRow();
      if (lastRow > 1) {
        var payrollRows = payrollSheet.getRange(2, 1, lastRow - 1, 10).getValues();
        payrollRows.forEach(function(row) {
          if (row[0] && row[1]) {
            var monthKey = row[0] instanceof Date ? Utilities.formatDate(row[0], Session.getScriptTimeZone(), "yyyy-MM") : String(row[0]);
            var staffId = String(row[1]);
            if (!result.payroll[monthKey]) {
              result.payroll[monthKey] = {};
            }
            result.payroll[monthKey][staffId] = {
              baseSalary: Number(row[2]),
              allowances: Number(row[3]),
              deductions: Number(row[4]),
              absentDeductions: Number(row[5]),
              netSalary: Number(row[6]),
              status: String(row[7]),
              remarks: String(row[8] || ""),
              lastUpdated: row[9] ? Number(row[9]) : Date.now()
            };
          }
        });
      }
    }

    // 4. Read Enrolled Students from student details tab
    var studentsSheet = ss.getSheetByName("student details");
    if (studentsSheet) {
      var lastRow = studentsSheet.getLastRow();
      if (lastRow > 1) {
        var studentRows = studentsSheet.getRange(2, 1, lastRow - 1, 11).getValues();
        studentRows.forEach(function(row) {
          if (row[0]) {
            result.students.push({
              id: String(row[0]),
              name: String(row[1]),
              mobile: String(row[2] || ""),
              course: String(row[3]),
              courseFee: Number(row[4]),
              amountReceived: Number(row[5]),
              dueDate: row[6] instanceof Date ? Utilities.formatDate(row[6], Session.getScriptTimeZone(), "yyyy-MM-dd") : String(row[6] || ""),
              dueAmount: Number(row[7]),
              feeType: row[8] ? String(row[8]).split(",").map(function(t) { return t.trim(); }).filter(Boolean) : [],
              remarks: String(row[9] || ""),
              lastUpdated: row[10] ? Number(row[10]) : Date.now()
            });
          }
        });
      }
    }

    // 5. Read Courses from Courses tab
    var coursesSheet = ss.getSheetByName("Courses");
    if (coursesSheet) {
      var lastRow = coursesSheet.getLastRow();
      if (lastRow > 1) {
        var courseRows = coursesSheet.getRange(2, 1, lastRow - 1, 3).getValues();
        courseRows.forEach(function(row) {
          if (row[0]) {
            result.courses.push({
              name: String(row[0]),
              price: Number(row[1]),
              lastUpdated: row[2] ? Number(row[2]) : Date.now()
            });
          }
        });
      }
    }
  } catch(err) {
    result.success = false;
    result.error = err.toString();
  }
  
  return ContentService.createTextOutput(JSON.stringify(result))
                       .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    // Wait for lock for up to 30 seconds
    lock.waitLock(30000);
  } catch(lockErr) {
    var result = { success: false, error: "Could not acquire script lock: " + lockErr.toString() };
    return ContentService.createTextOutput(JSON.stringify(result))
                         .setMimeType(ContentService.MimeType.JSON);
  }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var data = JSON.parse(e.postData.contents);
    var syncStaff = !data.options || data.options.syncStaff;
    var syncAttendance = !data.options || data.options.syncAttendance;
    
    // 1. Write Faculty details directly into Sheet1
    if (syncStaff) {
      var staffSheet = ss.getSheetByName("Sheet1") || ss.getSheets()[0];
      var lastRow = staffSheet.getLastRow();
      var lastCol = Math.max(1, staffSheet.getLastColumn());
      if (lastRow > 1) {
        staffSheet.getRange(2, 1, lastRow - 1, lastCol).clearContent();
      }
      
      data.staff.forEach(function(s) {
        staffSheet.appendRow([
          s.id,
          s.name,
          s.joiningDate,
          s.department,
          s.designation,
          s.baseSalary,
          s.status,
          s.email || "",
          s.phone || "",
          s.gender || "Male",
          s.salaryType || "Standard",
          s.bankName || "",
          s.bankAccount || "",
          s.bankIfsc || "",
          s.lastUpdated || Date.now()
        ]);
      });
      staffSheet.getRange("A1:O1").setFontWeight("bold");
      staffSheet.autoResizeColumns(1, 15);

      // 1b. Write Payroll details directly into Payroll tab
      if (data.payroll) {
        var payrollSheet = ss.getSheetByName("Payroll");
        if (!payrollSheet) {
          payrollSheet = ss.insertSheet("Payroll");
          payrollSheet.appendRow([
            "Month", "Staff ID", "Base Salary", "Allowances", "Deductions", 
            "Absent Deductions", "Net Salary", "Status", "Remarks", "Last Updated"
          ]);
          payrollSheet.getRange("A1:J1").setFontWeight("bold");
        }
        var lastRowP = payrollSheet.getLastRow();
        if (lastRowP > 1) {
          payrollSheet.getRange(2, 1, lastRowP - 1, 10).clearContent();
        }
        Object.keys(data.payroll).forEach(function(monthKey) {
          var monthRecords = data.payroll[monthKey];
          Object.keys(monthRecords).forEach(function(staffId) {
            var rec = monthRecords[staffId];
            payrollSheet.appendRow([
              monthKey,
              staffId,
              rec.baseSalary,
              rec.allowances,
              rec.deductions,
              rec.absentDeductions,
              rec.netSalary,
              rec.status,
              rec.remarks || "",
              rec.lastUpdated || Date.now()
            ]);
          });
        });
        payrollSheet.autoResizeColumns(1, 10);
      }
    }

    // 1c. Write Enrolled Students directly into student details tab
    if (data.students) {
      var studentsSheet = ss.getSheetByName("student details");
      if (!studentsSheet) {
        studentsSheet = ss.insertSheet("student details");
        studentsSheet.appendRow([
          "enrollment id", "name", "mobile no.", "courses", "course fees", 
          "amount received", "due date", "due amount", "fees type", "remarks", "lastUpdated"
        ]);
        studentsSheet.getRange("A1:K1").setFontWeight("bold");
      }
      var lastRowS = studentsSheet.getLastRow();
      if (lastRowS > 1) {
        studentsSheet.getRange(2, 1, lastRowS - 1, 11).clearContent();
      }
      data.students.forEach(function(s) {
        studentsSheet.appendRow([
          s.id,
          s.name,
          s.mobile || "",
          s.course,
          s.courseFee,
          s.amountReceived,
          s.dueDate || "",
          s.dueAmount || 0,
          s.feeType ? s.feeType.join(", ") : "",
          s.remarks || "",
          s.lastUpdated || Date.now()
        ]);
      });
      studentsSheet.autoResizeColumns(1, 11);
    }

    // 1d. Write Courses directly into Courses tab
    if (data.courses) {
      var coursesSheet = ss.getSheetByName("Courses");
      if (!coursesSheet) {
        coursesSheet = ss.insertSheet("Courses");
        coursesSheet.appendRow([
          "Course Name", "Price", "Last Updated"
        ]);
        coursesSheet.getRange("A1:C1").setFontWeight("bold");
      }
      var lastRowC = coursesSheet.getLastRow();
      if (lastRowC > 1) {
        coursesSheet.getRange(2, 1, lastRowC - 1, 3).clearContent();
      }
      data.courses.forEach(function(c) {
        coursesSheet.appendRow([
          c.name,
          c.price,
          c.lastUpdated || Date.now()
        ]);
      });
      coursesSheet.autoResizeColumns(1, 3);
    }
    
    // 2. Save Daily Attendance records to the Attendance tab
    if (syncAttendance) {
      var attendSheet = ss.getSheetByName("Attendance");
      if (!attendSheet) {
        attendSheet = ss.insertSheet("Attendance");
        attendSheet.appendRow([
          "Staff ID", "Name", "Date", "Check-In", "Check-Out", "Status", "Remarks"
        ]);
        attendSheet.getRange("A1:G1").setFontWeight("bold");
      }
      var lastRow = attendSheet.getLastRow();
      var lastCol = Math.max(1, attendSheet.getLastColumn());
      if (lastRow > 1) {
        attendSheet.getRange(2, 1, lastRow - 1, lastCol).clearContent();
      }
      
      var staffMap = {};
      data.staff.forEach(function(s) { staffMap[s.id] = s; });
      
      Object.keys(data.attendance).sort().forEach(function(dateStr) {
        var records = data.attendance[dateStr];
        Object.keys(records).forEach(function(staffId) {
          var rec = records[staffId];
          var s = staffMap[staffId] || { name: "" };
          attendSheet.appendRow([
            staffId,
            s.name,
            dateStr,
            rec.checkIn || "",
            rec.checkOut || "",
            rec.status,
            rec.remarks || ""
          ]);
        });
      });
      attendSheet.getRange("A1:G1").setFontWeight("bold");
      attendSheet.autoResizeColumns(1, 7);
    }

    var result = { success: true, message: "Sync operation completed successfully!" };
    return ContentService.createTextOutput(JSON.stringify(result))
                         .setMimeType(ContentService.MimeType.JSON);
                         
  } catch(err) {
    var result = { success: false, error: err.toString() };
    return ContentService.createTextOutput(JSON.stringify(result))
                         .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}`;

})();
