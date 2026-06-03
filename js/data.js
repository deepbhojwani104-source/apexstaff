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
        name: "Apex Coaching Institute",
        tagline: "Unlocking Academic Excellence",
        email: "contact@apexinstitute.edu",
        phone: "+91 98765 01234",
        address: "A-12, Metro Plaza, Sector 15, Noida, UP - 201301"
    };

    // System State Container
    let state = {
        staff: [],
        attendance: {}, // Date string 'YYYY-MM-DD' => { staffId: { status, checkIn, remarks } }
        payroll: {},    // 'YYYY-MM' => { staffId: { baseSalary, allowances, deductions, absentDeductions, netSalary, status, remarks } }
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
                state = {
                    staff: parsed.staff || [],
                    attendance: parsed.attendance || {},
                    payroll: parsed.payroll || {},
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
        if (updatedFields.email && updatedFields.email.toLowerCase() !== state.staff[index].email.toLowerCase()) {
            if (state.staff.some(s => s.email && s.email.toLowerCase() === updatedFields.email.toLowerCase() && s.id !== id)) {
                throw new Error(`Email ${updatedFields.email} is already in use.`);
            }
        }

        state.staff[index] = { ...state.staff[index], ...updatedFields };
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
        // Records should be map: { staffId: { status, checkIn, remarks } }
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
    AuraStore.calculatePayrollForMonth = function(year, month) {
        const key = `${year}-${String(month + 1).padStart(2, '0')}`;
        
        // Initialize payroll object for this month if missing
        if (!state.payroll[key]) {
            state.payroll[key] = {};
        }

        const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
        const activeStaff = state.staff.filter(s => s.status === "Active");

        activeStaff.forEach(employee => {
            const attendStats = AuraStore.calculateStaffAttendanceStats(employee.id, year, month);
            
            let absentDeductions = 0;
            const salaryType = employee.salaryType || "Standard";

            if (salaryType === "Fixed") {
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
                remarks
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
            netSalary
        };

        AuraStore.saveState();
        AuraStore.logActivity(`Updated salary adjustments for ${AuraStore.getStaffById(staffId).name} (${staffId}).`, "success");
    };

    AuraStore.approveAllPayroll = function(year, month) {
        const key = `${year}-${String(month + 1).padStart(2, '0')}`;
        if (!state.payroll[key]) return;

        Object.keys(state.payroll[key]).forEach(staffId => {
            state.payroll[key][staffId].status = "Paid";
        });

        AuraStore.saveState();
        AuraStore.logActivity(`Approved and finalized all payroll registers for ${key}.`, "success");
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

        AuraStore.saveState();
        AuraStore.logActivity("Demo databases populated with realistic records.", "success");
    };

    // 9. Session Authentication Gateways
    AuraStore.isLoggedIn = function() {
        return sessionStorage.getItem(SESSION_KEY) === "true";
    };

    AuraStore.login = function(username, password) {
        if (username === "admin" && password === "admin123") {
            sessionStorage.setItem(SESSION_KEY, "true");
            AuraStore.logActivity("Administrator session authenticated.", "success");
            return true;
        }
        AuraStore.logActivity(`Failed login attempt for user: ${username}`, "warning");
        return false;
    };

    AuraStore.logout = function() {
        sessionStorage.removeItem(SESSION_KEY);
        AuraStore.logActivity("Administrator session terminated.", "info");
    };

    // 10. Google Sheets URL Configuration
    AuraStore.getSheetsUrlStaff = function() {
        return state.sheetsUrlStaff || "";
    };

    AuraStore.setSheetsUrlStaff = function(url) {
        state.sheetsUrlStaff = url || "";
        AuraStore.saveState();
        AuraStore.logActivity("Faculty Directory Sync Web App URL updated.", "info");
    };

    AuraStore.getSheetsUrlAttendance = function() {
        return state.sheetsUrlAttendance || "";
    };

    AuraStore.setSheetsUrlAttendance = function(url) {
        state.sheetsUrlAttendance = url || "";
        AuraStore.saveState();
        AuraStore.logActivity("Attendance Log Sync Web App URL updated.", "info");
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

        let pending = 0;
        let errors = [];

        if (syncStaff && urlStaff) pending++;
        if (syncAttendance && urlAttendance) pending++;

        if (pending === 0) {
            if (callback) callback("No active sync URLs configured or selected in options.", false);
            return;
        }

        function done(err) {
            if (err) errors.push(err);
            pending--;
            if (pending === 0) {
                if (errors.length > 0) {
                    if (callback) callback(errors.join(", "), false);
                } else {
                    if (callback) callback(null, true);
                }
            }
        }

        if (syncStaff && urlStaff) {
            const payload = {
                branding: state.branding,
                staff: state.staff,
                options: {
                    syncStaff: true,
                    syncAttendance: false
                }
            };
            AuraStore.postPayload(urlStaff, payload, done);
        }

        if (syncAttendance && urlAttendance) {
            const payload = {
                branding: state.branding,
                staff: state.staff, // Needed by script to cross reference names
                attendance: state.attendance,
                options: {
                    syncStaff: false,
                    syncAttendance: true
                }
            };
            AuraStore.postPayload(urlAttendance, payload, done);
        }
    };

    // Copyable Google Apps Script Template
    AuraStore.GOOGLE_SCRIPT_TEMPLATE = `function doGet(e) {
  var result = { success: true, status: "online", message: "AuraStaff Web API is active. Ready to sync database." };
  return ContentService.createTextOutput(JSON.stringify(result))
                       .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  try {
    var data = JSON.parse(e.postData.contents);
    var syncStaff = !data.options || data.options.syncStaff;
    var syncAttendance = !data.options || data.options.syncAttendance;
    
    // 1. Write Faculty details directly into Sheet1 (the active/first tab with headers)
    if (syncStaff) {
      var staffSheet = ss.getSheetByName("Sheet1") || ss.getSheets()[0];
      
      // Clear all rows below the headers (row 2 onwards)
      var lastRow = staffSheet.getLastRow();
      var lastCol = Math.max(1, staffSheet.getLastColumn());
      if (lastRow > 1) {
        staffSheet.getRange(2, 1, lastRow - 1, lastCol).clearContent();
      }
      
      // Map staff details directly into your columns A to G
      data.staff.forEach(function(s) {
        staffSheet.appendRow([
          s.id,                  // Column A: faculty id
          s.name,                // Column B: name
          s.joiningDate,         // Column C: Date of Joining
          s.department,          // Column D: Department
          s.designation,         // Column E: Subject/Role
          s.baseSalary,          // Column F: salary
          s.status               // Column G: employment status
        ]);
      });
      staffSheet.getRange("A1:G1").setFontWeight("bold");
      staffSheet.autoResizeColumns(1, 8);
    }
    
    // 2. Save Daily Attendance records to the Attendance tab of your Attendance spreadsheet
    if (syncAttendance) {
      var attendSheet = ss.getSheetByName("Attendance") || ss.getSheetByName("Sheet1") || ss.getSheets()[0];
      
      // Clear all rows below the headers (row 2 onwards)
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
            staffId,               // Column A: faculty id
            s.name,                // Column B: name
            dateStr,               // Column C: Attendance Date
            rec.checkIn || "",     // Column D: check in time
            rec.status,            // Column E: Attendance status
            rec.remarks || ""      // Column F: Remarks
          ]);
        });
      });
      attendSheet.getRange("A1:F1").setFontWeight("bold");
      attendSheet.autoResizeColumns(1, 6);
    }

    var result = { success: true, message: "Sync operation completed successfully!" };
    return ContentService.createTextOutput(JSON.stringify(result))
                         .setMimeType(ContentService.MimeType.JSON);
                         
  } catch(err) {
    var result = { success: false, error: err.toString() };
    return ContentService.createTextOutput(JSON.stringify(result))
                         .setMimeType(ContentService.MimeType.JSON);
  }
}`;

})();
