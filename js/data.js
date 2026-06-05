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
        inventory: [],
        finance: {},    // 'YYYY-MM' => { lightBill, waterBill, otherExpenses, otherExpensesDetails }
        branding: { ...DEFAULT_BRANDING },
        logs: []
    };

    // Keys for LocalStorage
    const STORAGE_KEY = "aurastaff_data_state";
    const SESSION_KEY = "aurastaff_logged_in";

    AuraStore.useFirebase = false;
    AuraStore.db = null;

    // Helper to start Firestore real-time collection sync listeners
    function initFirebaseListeners() {
        if (!AuraStore.db) return;
        const db = AuraStore.db;

        // 1. Staff Listener
        db.collection("staff").onSnapshot(snapshot => {
            const list = [];
            snapshot.forEach(doc => {
                list.push(doc.data());
            });
            const isMigrated = localStorage.getItem("aurastaff_firebase_migrated") === "true";
            if (snapshot.empty && !isMigrated) {
                console.log("Firestore staff collection is empty; guarding local data before migration.");
                return;
            }
            state.staff = list;
            AuraStore.saveState();
            document.dispatchEvent(new CustomEvent('firebaseDataChanged', { detail: { view: "directory" } }));
            document.dispatchEvent(new CustomEvent('firebaseDataChanged', { detail: { view: "dashboard" } }));
        }, err => console.error("Firestore staff snapshot error:", err));

        // 2. Attendance Listener
        db.collection("attendance").onSnapshot(snapshot => {
            const attend = {};
            snapshot.forEach(doc => {
                attend[doc.id] = doc.data();
            });
            const isMigrated = localStorage.getItem("aurastaff_firebase_migrated") === "true";
            if (snapshot.empty && !isMigrated) {
                console.log("Firestore attendance collection is empty; guarding local data before migration.");
                return;
            }
            state.attendance = attend;
            AuraStore.saveState();
            document.dispatchEvent(new CustomEvent('firebaseDataChanged', { detail: { view: "attendance" } }));
            document.dispatchEvent(new CustomEvent('firebaseDataChanged', { detail: { view: "dashboard" } }));
        }, err => console.error("Firestore attendance snapshot error:", err));

        // 3. Payroll Listener
        db.collection("payroll").onSnapshot(snapshot => {
            const pay = {};
            snapshot.forEach(doc => {
                pay[doc.id] = doc.data();
            });
            const isMigrated = localStorage.getItem("aurastaff_firebase_migrated") === "true";
            if (snapshot.empty && !isMigrated) {
                console.log("Firestore payroll collection is empty; guarding local data before migration.");
                return;
            }
            state.payroll = pay;
            AuraStore.saveState();
            document.dispatchEvent(new CustomEvent('firebaseDataChanged', { detail: { view: "payroll" } }));
            document.dispatchEvent(new CustomEvent('firebaseDataChanged', { detail: { view: "dashboard" } }));
        }, err => console.error("Firestore payroll snapshot error:", err));

        // 4. Students Listener
        db.collection("students").onSnapshot(snapshot => {
            const list = [];
            snapshot.forEach(doc => {
                list.push(doc.data());
            });
            const isMigrated = localStorage.getItem("aurastaff_firebase_migrated") === "true";
            if (snapshot.empty && !isMigrated) {
                console.log("Firestore students collection is empty; guarding local data before migration.");
                return;
            }
            state.students = list;
            AuraStore.saveState();
            document.dispatchEvent(new CustomEvent('firebaseDataChanged', { detail: { view: "students" } }));
            document.dispatchEvent(new CustomEvent('firebaseDataChanged', { detail: { view: "dashboard" } }));
        }, err => console.error("Firestore students snapshot error:", err));

        // 5. Courses Listener
        db.collection("courses").onSnapshot(snapshot => {
            const list = [];
            snapshot.forEach(doc => {
                list.push(doc.data());
            });
            const isMigrated = localStorage.getItem("aurastaff_firebase_migrated") === "true";
            if (snapshot.empty && !isMigrated) {
                console.log("Firestore courses collection is empty; guarding local data before migration.");
                return;
            }
            state.courses = list;
            AuraStore.saveState();
            document.dispatchEvent(new CustomEvent('firebaseDataChanged', { detail: { view: "students" } }));
        }, err => console.error("Firestore courses snapshot error:", err));

        // 6. Inventory Listener
        db.collection("inventory").onSnapshot(snapshot => {
            const list = [];
            snapshot.forEach(doc => {
                list.push(doc.data());
            });
            const isMigrated = localStorage.getItem("aurastaff_firebase_migrated") === "true";
            if (snapshot.empty && !isMigrated) {
                console.log("Firestore inventory collection is empty; guarding local data before migration.");
                return;
            }
            state.inventory = list;
            AuraStore.saveState();
            document.dispatchEvent(new CustomEvent('firebaseDataChanged', { detail: { view: "inventory" } }));
            document.dispatchEvent(new CustomEvent('firebaseDataChanged', { detail: { view: "dashboard" } }));
        }, err => console.error("Firestore inventory snapshot error:", err));

        // 7. Branding Listener
        db.collection("branding").doc("current").onSnapshot(doc => {
            const isMigrated = localStorage.getItem("aurastaff_firebase_migrated") === "true";
            if (!doc.exists && !isMigrated) {
                console.log("Firestore branding doc is missing; guarding local branding before migration.");
                return;
            }
            if (doc.exists) {
                state.branding = doc.data();
                AuraStore.saveState();
                document.dispatchEvent(new CustomEvent('firebaseDataChanged', { detail: { view: "settings" } }));
                const sidebarBrandH2 = document.querySelector(".sidebar-brand h2");
                if (sidebarBrandH2 && state.branding && state.branding.name) {
                    sidebarBrandH2.innerHTML = `${state.branding.name.split(" ")[0]}<span>Staff</span>`;
                }
            }
        }, err => console.error("Firestore branding snapshot error:", err));

        // 8. Logs Listener
        db.collection("logs").doc("current").onSnapshot(doc => {
            const isMigrated = localStorage.getItem("aurastaff_firebase_migrated") === "true";
            if (!doc.exists && !isMigrated) {
                console.log("Firestore logs doc is missing; guarding local logs before migration.");
                return;
            }
            if (doc.exists) {
                state.logs = doc.data().logsList || [];
                AuraStore.saveState();
                document.dispatchEvent(new CustomEvent('activityLogged'));
            }
        }, err => console.error("Firestore logs snapshot error:", err));

        // 9. Finance Listener
        db.collection("finance").onSnapshot(snapshot => {
            const data = {};
            snapshot.forEach(doc => {
                data[doc.id] = doc.data();
            });
            const isMigrated = localStorage.getItem("aurastaff_firebase_migrated") === "true";
            if (snapshot.empty && !isMigrated) {
                console.log("Firestore finance collection is empty; guarding local data before migration.");
                return;
            }
            state.finance = data;
            AuraStore.saveState();
            document.dispatchEvent(new CustomEvent('firebaseDataChanged', { detail: { view: "finance" } }));
            document.dispatchEvent(new CustomEvent('firebaseDataChanged', { detail: { view: "dashboard" } }));
        }, err => console.error("Firestore finance snapshot error:", err));
    }

    // Initialize Firebase SDK Connection
    AuraStore.initFirebase = function() {
        const configStr = localStorage.getItem("aurastaff_firebase_config");
        if (!configStr) {
            AuraStore.useFirebase = false;
            AuraStore.db = null;
            return;
        }

        try {
            if (typeof firebase === 'undefined') {
                console.warn("Firebase SDK script not loaded yet.");
                return;
            }
            const firebaseConfig = JSON.parse(configStr);
            if (firebase.apps.length === 0) {
                firebase.initializeApp(firebaseConfig);
            }
            const db = firebase.firestore();
            db.enablePersistence({ synchronizeTabs: true }).catch(err => {
                console.warn("Firestore persistence warning:", err.code);
            });
            AuraStore.db = db;
            AuraStore.useFirebase = true;
            initFirebaseListeners();
            AuraStore.logActivity("Firebase connected successfully.", "success");
        } catch (e) {
            console.error("Firebase init failed:", e);
            AuraStore.logActivity("Firebase cloud connection failed.", "danger");
            AuraStore.useFirebase = false;
            AuraStore.db = null;
        }
    };

    // Safe Local-to-Cloud Database Migrator Utility
    AuraStore.uploadLocalToFirebase = function(callback) {
        if (!AuraStore.useFirebase || !AuraStore.db) {
            if (callback) callback("Firebase is not connected.");
            return;
        }
        const db = AuraStore.db;
        const batch = db.batch();

        try {
            // Batch writes for Staff
            state.staff.forEach(s => {
                batch.set(db.collection("staff").doc(s.id), s);
            });

            // Batch writes for Students
            state.students.forEach(s => {
                batch.set(db.collection("students").doc(s.id), s);
            });

            // Batch writes for Inventory
            state.inventory.forEach(i => {
                batch.set(db.collection("inventory").doc(i.id), i);
            });

            // Batch writes for Courses
            state.courses.forEach(c => {
                batch.set(db.collection("courses").doc(c.name), c);
            });

            // Batch writes for Attendance logs
            Object.keys(state.attendance).forEach(d => {
                batch.set(db.collection("attendance").doc(d), state.attendance[d]);
            });

            // Batch writes for Payroll registers
            Object.keys(state.payroll).forEach(m => {
                batch.set(db.collection("payroll").doc(m), state.payroll[m]);
            });

            // Batch writes for Finance
            Object.keys(state.finance).forEach(m => {
                batch.set(db.collection("finance").doc(m), state.finance[m]);
            });

            // Branding profile
            batch.set(db.collection("branding").doc("current"), state.branding);

            // Audit Logs
            batch.set(db.collection("logs").doc("current"), { logsList: state.logs });

            batch.commit()
                .then(() => {
                    localStorage.setItem("aurastaff_firebase_migrated", "true");
                    AuraStore.logActivity("Local records successfully migrated to Firestore cloud.", "success");
                    if (callback) callback(null, true);
                })
                .catch(err => {
                    console.error("Migration batch commit failed:", err);
                    if (callback) callback(err.message, false);
                });
        } catch (err) {
            console.error("Migration error:", err);
            if (callback) callback(err.message, false);
        }
    };

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
                    inventory: parsed.inventory || [],
                    finance: parsed.finance || {},
                    branding: parsed.branding || { ...DEFAULT_BRANDING },
                    logs: parsed.logs || []
                };
            }
            
            // Connect Firebase if config parameters exist
            AuraStore.initFirebase();
            
        } catch (e) {
            console.error("Error loading localStorage data", e);
            AuraStore.logActivity("Failed to load local storage state.", "danger");
        }
    };

    // 2. Save State to storage
    AuraStore.saveState = function() {
        try {
            const isMigrated = localStorage.getItem("aurastaff_firebase_migrated") === "true";
            if (AuraStore.useFirebase && isMigrated) {
                // If Firebase is active and migrated, do not save data arrays to LocalStorage.
                // We only save branding and logs.
                const minimalState = {
                    branding: state.branding,
                    logs: state.logs
                };
                localStorage.setItem(STORAGE_KEY, JSON.stringify(minimalState));
                return;
            }
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

        if (AuraStore.useFirebase && AuraStore.db) {
            AuraStore.db.collection("logs").doc("current").set({ logsList: state.logs })
                .catch(err => console.error("Firestore logActivity error:", err));
        }
    };

    AuraStore.clearLogs = function() {
        state.logs = [];
        AuraStore.saveState();
        AuraStore.logActivity("System activity logs cleared.", "info");

        if (AuraStore.useFirebase && AuraStore.db) {
            AuraStore.db.collection("logs").doc("current").set({ logsList: [] })
                .catch(err => console.error("Firestore clearLogs error:", err));
        }
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

        if (AuraStore.useFirebase && AuraStore.db) {
            AuraStore.db.collection("branding").doc("current").set(state.branding)
                .catch(err => console.error("Firestore branding update error:", err));
        }
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

        if (AuraStore.useFirebase && AuraStore.db) {
            AuraStore.db.collection("staff").doc(staffObj.id).set(staffObj)
                .catch(err => console.error("Firestore addStaff error:", err));
        }

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

        if (AuraStore.useFirebase && AuraStore.db) {
            AuraStore.db.collection("staff").doc(id).set(state.staff[index])
                .catch(err => console.error("Firestore updateStaff error:", err));
        }

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

        if (AuraStore.useFirebase && AuraStore.db) {
            AuraStore.db.collection("staff").doc(id).delete()
                .catch(err => console.error("Firestore deleteStaff error:", err));
        }
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

        if (AuraStore.useFirebase && AuraStore.db) {
            AuraStore.db.collection("attendance").doc(dateStr).set(records)
                .catch(err => console.error("Firestore saveDailyAttendance error:", err));
        }
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

        if (AuraStore.useFirebase && AuraStore.db) {
            AuraStore.db.collection("payroll").doc(key).set(state.payroll[key])
                .catch(err => console.error("Firestore calculatePayrollForMonth error:", err));
        }

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

        if (AuraStore.useFirebase && AuraStore.db) {
            AuraStore.db.collection("payroll").doc(key).set(state.payroll[key])
                .catch(err => console.error("Firestore updatePayrollAdjustment error:", err));
        }
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

        if (AuraStore.useFirebase && AuraStore.db) {
            AuraStore.db.collection("payroll").doc(key).set(state.payroll[key])
                .catch(err => console.error("Firestore approveAllPayroll error:", err));
        }
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
                        students: parsed.students || [],
                        courses: parsed.courses || [],
                        inventory: parsed.inventory || [],
                        finance: parsed.finance || {},
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
        if (AuraStore.useFirebase && AuraStore.db) {
            const db = AuraStore.db;
            state.staff.forEach(s => db.collection("staff").doc(s.id).delete().catch(e => console.error(e)));
            state.students.forEach(s => db.collection("students").doc(s.id).delete().catch(e => console.error(e)));
            state.inventory.forEach(i => db.collection("inventory").doc(i.id).delete().catch(e => console.error(e)));
            state.courses.forEach(c => db.collection("courses").doc(c.name).delete().catch(e => console.error(e)));
            Object.keys(state.attendance).forEach(d => db.collection("attendance").doc(d).delete().catch(e => console.error(e)));
            Object.keys(state.payroll).forEach(k => db.collection("payroll").doc(k).delete().catch(e => console.error(e)));
            Object.keys(state.finance).forEach(k => db.collection("finance").doc(k).delete().catch(e => console.error(e)));
            db.collection("branding").doc("current").set(DEFAULT_BRANDING).catch(e => console.error(e));
            db.collection("logs").doc("current").set({ logsList: [] }).catch(e => console.error(e));
        }

        state = {
            staff: [],
            attendance: {},
            payroll: {},
            students: [],
            courses: [],
            inventory: [],
            finance: {},
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
                enrollmentDate: "2026-05-12",
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
                enrollmentDate: "2026-05-15",
                feeType: ["New Registration"],
                remarks: "Paid full fees up front.",
                lastUpdated: Date.now()
            }
        ];

        // Seed monthly finance entries
        state.finance = {
            "2026-05": {
                lightBill: 3500,
                waterBill: 650,
                otherExpenses: 1200,
                otherExpensesDetails: "Internet subscription & staff tea/snacks",
                otherIncome: 4500,
                otherIncomeDetails: "Classroom B venue rental",
                lastUpdated: Date.now()
            }
        };

        // Seed realistic inventory items
        state.inventory = [
            {
                id: "INV-1001",
                name: "Whiteboard Markers",
                category: "Consumable",
                quantity: 30,
                price: 45,
                totalAmount: 1350,
                purchaseDate: "2026-05-10",
                remarks: "Box of 30, Blue and Black",
                lastUpdated: Date.now()
            },
            {
                id: "INV-1002",
                name: "Office Chairs",
                category: "Permanent",
                quantity: 15,
                price: 2400,
                totalAmount: 36000,
                purchaseDate: "2025-12-15",
                remarks: "Ergonomic mesh chairs for staff",
                lastUpdated: Date.now()
            },
            {
                id: "INV-1003",
                name: "Projector Epson EH-TW",
                category: "Permanent",
                quantity: 2,
                price: 42000,
                totalAmount: 84000,
                purchaseDate: "2026-02-20",
                remarks: "Installed in Classrooms A and B",
                lastUpdated: Date.now()
            }
        ];

        AuraStore.saveState();
        AuraStore.logActivity("Demo databases populated with realistic records.", "success");

        // If Firebase is connected, auto-upload local data to Firebase Firestore
        if (AuraStore.useFirebase && AuraStore.db) {
            AuraStore.uploadLocalToFirebase();
        }
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

        if (AuraStore.useFirebase && AuraStore.db) {
            AuraStore.db.collection("courses").doc(courseObj.name).set(courseObj)
                .catch(err => console.error("Firestore addCourse error:", err));
        }
    };

    AuraStore.deleteCourse = function(name) {
        if (!state.courses) return;
        const index = state.courses.findIndex(c => c.name === name);
        if (index !== -1) {
            state.courses.splice(index, 1);
            AuraStore.saveState();
            AuraStore.logActivity(`Removed course ${name}.`, "danger");

            if (AuraStore.useFirebase && AuraStore.db) {
                AuraStore.db.collection("courses").doc(name).delete()
                    .catch(err => console.error("Firestore deleteCourse error:", err));
            }
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

        if (AuraStore.useFirebase && AuraStore.db) {
            AuraStore.db.collection("students").doc(studentObj.id).set(studentObj)
                .catch(err => console.error("Firestore addStudent error:", err));
        }

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

        if (AuraStore.useFirebase && AuraStore.db) {
            AuraStore.db.collection("students").doc(id).set(state.students[index])
                .catch(err => console.error("Firestore updateStudent error:", err));
        }

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

        if (AuraStore.useFirebase && AuraStore.db) {
            AuraStore.db.collection("students").doc(id).delete()
                .catch(err => console.error("Firestore deleteStudent error:", err));
        }
    };

    // Inventory operations
    AuraStore.getInventory = function() {
        return state.inventory || [];
    };

    AuraStore.addInventoryItem = function(itemObj) {
        if (!state.inventory) state.inventory = [];
        if (!itemObj.id) {
            const nextNum = state.inventory.length > 0
                ? Math.max(...state.inventory.map(i => Number(i.id.split('-')[1]) || 1000)) + 1
                : 1001;
            itemObj.id = `INV-${nextNum}`;
        }
        itemObj.lastUpdated = Date.now();
        state.inventory.push(itemObj);
        AuraStore.saveState();
        AuraStore.logActivity(`Added inventory item ${itemObj.name} (${itemObj.id})`, "success");

        if (AuraStore.useFirebase && AuraStore.db) {
            AuraStore.db.collection("inventory").doc(itemObj.id).set(itemObj)
                .catch(err => console.error("Firestore addInventoryItem error:", err));
        }

        return itemObj;
    };

    AuraStore.updateInventoryItem = function(id, updatedFields) {
        if (!state.inventory) return;
        const index = state.inventory.findIndex(item => item.id === id);
        if (index === -1) {
            throw new Error("Inventory item not found.");
        }
        state.inventory[index] = {
            ...state.inventory[index],
            ...updatedFields,
            lastUpdated: Date.now()
        };
        AuraStore.saveState();
        AuraStore.logActivity(`Updated inventory item ${state.inventory[index].name} (${id})`, "info");

        if (AuraStore.useFirebase && AuraStore.db) {
            AuraStore.db.collection("inventory").doc(id).set(state.inventory[index])
                .catch(err => console.error("Firestore updateInventoryItem error:", err));
        }

        return state.inventory[index];
    };

    AuraStore.deleteInventoryItem = function(id) {
        if (!state.inventory) return;
        const index = state.inventory.findIndex(item => item.id === id);
        if (index === -1) return;
        const name = state.inventory[index].name;
        state.inventory.splice(index, 1);
        AuraStore.saveState();
        AuraStore.logActivity(`Removed inventory item ${name} (${id})`, "danger");

        if (AuraStore.useFirebase && AuraStore.db) {
            AuraStore.db.collection("inventory").doc(id).delete()
                .catch(err => console.error("Firestore deleteInventoryItem error:", err));
        }
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

    AuraStore.getMonthlyFinance = function(monthKey) {
        return state.finance[monthKey] || { lightBill: 0, waterBill: 0, otherExpenses: 0, otherExpensesDetails: "", otherIncome: 0, otherIncomeDetails: "" };
    };

    AuraStore.saveMonthlyFinance = function(monthKey, data) {
        state.finance[monthKey] = {
            lightBill: Number(data.lightBill) || 0,
            waterBill: Number(data.waterBill) || 0,
            otherExpenses: Number(data.otherExpenses) || 0,
            otherExpensesDetails: data.otherExpensesDetails || "",
            otherIncome: Number(data.otherIncome) || 0,
            otherIncomeDetails: data.otherIncomeDetails || "",
            lastUpdated: Date.now()
        };
        AuraStore.saveState();
        AuraStore.logActivity(`Saved financial expenses for ${monthKey}`, "success");

        if (AuraStore.useFirebase && AuraStore.db) {
            AuraStore.db.collection("finance").doc(monthKey).set(state.finance[monthKey])
                .catch(err => console.error("Firestore saveMonthlyFinance error:", err));
        }
    };

    AuraStore.getAllFinance = function() {
        return state.finance || {};
    };

    // 11. CSV Formatting Exporters (Retained for backup if needed)
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

})();
