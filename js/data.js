/* ==========================================================================
   AURASTAFF: DATA LAYER
   ========================================================================== */

(function() {
    // Namespace check
    if (!window.AuraStore) {
        window.AuraStore = {};
    }
    AuraStore.currentTenantId = null;
    AuraStore.getCurrentTenantId = function() {
        return AuraStore.currentTenantId;
    };
    function getCollectionRef(name) {
        if (!AuraStore.db) return null;
        if (AuraStore.currentTenantId) {
            const finalName = name === "branding" ? "config" : name;
            return AuraStore.db.collection("tenants").doc(AuraStore.currentTenantId).collection(finalName);
        }
        // If Firebase mode is active, block root collection access to prevent pollution
        if (AuraStore.useFirebase) {
            if (name !== "logs") {
                console.warn(`Blocked root collection access for '${name}' because no tenant is active.`);
            }
            return null;
        }
        return AuraStore.db.collection(name);
    }
    AuraStore.getCollectionRef = getCollectionRef;
    
    function safeFirestoreWrite(collectionName, docId, data, method = "set") {
        if (!AuraStore.useFirebase || !AuraStore.db) return;
        
        const ref = getCollectionRef(collectionName);
        if (!ref) {
            // Silently ignore log writes or startup syncs before login, only warn for other data
            if (collectionName !== "logs") {
                console.warn(`Firestore Write Blocked: Collection '${collectionName}' ref is null (no active tenant ID).`);
            }
            return;
        }
        
        if (method === "set") {
            ref.doc(docId).set(data).catch(err => {
                console.error(`Firestore set error for ${collectionName}/${docId}:`, err);
                if (window.AuraDOM && AuraDOM.showToast) {
                    AuraDOM.showToast(`Cloud Sync Error: ${err.message || err}`, "error");
                }
            });
        } else if (method === "delete") {
            ref.doc(docId).delete().catch(err => {
                console.error(`Firestore delete error for ${collectionName}/${docId}:`, err);
                if (window.AuraDOM && AuraDOM.showToast) {
                    AuraDOM.showToast(`Cloud Sync Error: ${err.message || err}`, "error");
                }
            });
        }
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
        finance: {},    // 'YYYY-MM' => { lightBill, waterBill, otherExpenses, otherExpensesDetails, otherIncomeList }
        studentAttendance: {}, // 'YYYY-MM-DD' => { studentId: { status, remarks, lastUpdated } }
        branding: { ...DEFAULT_BRANDING },
        logs: [],
        passwords: {
            admin: "admin123",
            clerk: "clerk123",
            faculty: "faculty123"
        }
    };

    // Keys for LocalStorage
    const STORAGE_KEY = "aurastaff_data_state";
    const SESSION_KEY = "aurastaff_logged_in";

    AuraStore.useFirebase = false;
    AuraStore.db = null;

    // Helper to start Firestore real-time collection sync listeners
    let activeUnsubscribes = [];

    AuraStore.startFirebaseListeners = function() {
        if (!AuraStore.db || !AuraStore.currentTenantId) return;
        AuraStore.stopFirebaseListeners();

        // 1. Staff Listener
        let unsub1 = getCollectionRef("staff").onSnapshot(snapshot => {
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
        activeUnsubscribes.push(unsub1);

        // 2. Attendance Listener
        let unsub2 = getCollectionRef("attendance").onSnapshot(snapshot => {
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
        activeUnsubscribes.push(unsub2);

        // 3. Payroll Listener
        let unsub3 = getCollectionRef("payroll").onSnapshot(snapshot => {
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
        activeUnsubscribes.push(unsub3);

        // 4. Students Listener
        let unsub4 = getCollectionRef("students").onSnapshot(snapshot => {
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
        activeUnsubscribes.push(unsub4);

        // 5. Courses Listener
        let unsub5 = getCollectionRef("courses").onSnapshot(snapshot => {
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
        activeUnsubscribes.push(unsub5);

        // 6. Inventory Listener
        let unsub6 = getCollectionRef("inventory").onSnapshot(snapshot => {
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
        activeUnsubscribes.push(unsub6);

        // 7. Branding Listener
        let unsub7 = getCollectionRef("branding").doc("current").onSnapshot(doc => {
            const isMigrated = localStorage.getItem("aurastaff_firebase_migrated") === "true";
            if (!doc.exists && !isMigrated) {
                console.log("Firestore branding doc is missing; guarding local branding before migration.");
                return;
            }
            if (doc.exists) {
                const data = doc.data();
                if (data && data.active === false) {
                    alert("Something went wrong. contact to administrator ");
                    setTimeout(() => {
                        window.location.reload();
                    }, 500);
                    return;
                }
                state.branding = data;
                AuraStore.saveState();
                
                if (AuraStore.applyTenantUI) {
                    AuraStore.applyTenantUI(state.branding);
                }
                
                document.dispatchEvent(new CustomEvent('firebaseDataChanged', { detail: { view: "settings" } }));
                const sidebarBrandH2 = document.querySelector(".sidebar-brand h2");
                if (sidebarBrandH2 && state.branding && state.branding.name) {
                    sidebarBrandH2.innerHTML = `${state.branding.name.split(" ")[0]}<span>Staff</span>`;
                }
            }
        }, err => console.error("Firestore branding snapshot error:", err));
        activeUnsubscribes.push(unsub7);

        // 8. Logs Listener
        let unsub8 = getCollectionRef("logs").doc("current").onSnapshot(doc => {
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
        activeUnsubscribes.push(unsub8);

        // 9. Finance Listener
        let unsub9 = getCollectionRef("finance").onSnapshot(snapshot => {
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
        activeUnsubscribes.push(unsub9);

        // 10. Student Attendance Listener
        let unsub10 = getCollectionRef("studentAttendance").onSnapshot(snapshot => {
            const attend = {};
            snapshot.forEach(doc => {
                attend[doc.id] = doc.data();
            });
            const isMigrated = localStorage.getItem("aurastaff_firebase_migrated") === "true";
            if (snapshot.empty && !isMigrated) {
                console.log("Firestore studentAttendance collection is empty; guarding local data before migration.");
                return;
            }
            state.studentAttendance = attend;
            AuraStore.saveState();
            document.dispatchEvent(new CustomEvent('firebaseDataChanged', { detail: { view: "student-attendance" } }));
        }, err => console.error("Firestore studentAttendance snapshot error:", err));
        activeUnsubscribes.push(unsub10);

        // 11. Security Listener
        let unsub11 = getCollectionRef("security").doc("passwords").onSnapshot(doc => {
            const isMigrated = localStorage.getItem("aurastaff_firebase_migrated") === "true";
            if (!doc.exists && !isMigrated) {
                console.log("Firestore security passwords doc is missing; guarding local passwords.");
                return;
            }
            if (doc.exists) {
                state.passwords = doc.data();
                AuraStore.saveState();
            }
        }, err => console.error("Firestore security snapshot error:", err));
        activeUnsubscribes.push(unsub11);
    };

    AuraStore.stopFirebaseListeners = function() {
        activeUnsubscribes.forEach(unsub => {
            if (typeof unsub === "function") unsub();
        });
        activeUnsubscribes = [];
    };

        AuraStore.firebaseInitError = null;

    // Initialize Firebase SDK Connection
    AuraStore.initFirebase = function() {
        const configStr = localStorage.getItem("aurastaff_firebase_config");
        if (!configStr) {
            AuraStore.useFirebase = false;
            AuraStore.db = null;
            AuraStore.firebaseInitError = "No Firebase configuration found. Please setup cloud connection.";
            return;
        }

        try {
            if (typeof firebase === 'undefined') {
                console.warn("Firebase SDK script not loaded yet.");
                AuraStore.firebaseInitError = "Firebase SDK script failed to load (check your network connection or adblocker).";
                AuraStore.useFirebase = false;
                AuraStore.db = null;
                return;
            }
            const firebaseConfig = JSON.parse(configStr);
            if (firebase.apps.length === 0) {
                firebase.initializeApp(firebaseConfig);
            }
            const db = firebase.firestore();
            try {
                db.enablePersistence({ synchronizeTabs: true }).catch(err => {
                    console.warn("Firestore persistence warning:", err.code);
                });
            } catch (persistErr) {
                console.warn("Firestore persistence synchronous error:", persistErr);
            }
            AuraStore.db = db;
            AuraStore.useFirebase = true;
            AuraStore.firebaseInitError = null;
            // Listeners started dynamically after login
            AuraStore.logActivity("Firebase connected successfully.", "success");
        } catch (e) {
            console.error("Firebase init failed:", e);
            AuraStore.logActivity("Firebase cloud connection failed.", "danger");
            AuraStore.firebaseInitError = "Firebase Init Failed: " + (e.message || e);
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
        if (!AuraStore.currentTenantId) {
            if (callback) callback("Cannot migrate data: No active tenant session. Please log in using your institute email first.");
            return;
        }
        const db = AuraStore.db;
        const batch = db.batch();

        try {
            // Batch writes for Staff
            state.staff.forEach(s => {
                batch.set(getCollectionRef("staff").doc(s.id), s);
            });

            // Batch writes for Students
            state.students.forEach(s => {
                batch.set(getCollectionRef("students").doc(s.id), s);
            });

            // Batch writes for Inventory
            state.inventory.forEach(i => {
                batch.set(getCollectionRef("inventory").doc(i.id), i);
            });

            // Batch writes for Courses
            state.courses.forEach(c => {
                batch.set(getCollectionRef("courses").doc(c.name), c);
            });

            // Batch writes for Attendance logs
            Object.keys(state.attendance).forEach(d => {
                batch.set(getCollectionRef("attendance").doc(d), state.attendance[d]);
            });

            // Batch writes for Payroll registers
            Object.keys(state.payroll).forEach(m => {
                batch.set(getCollectionRef("payroll").doc(m), state.payroll[m]);
            });

            // Batch writes for Finance
            Object.keys(state.finance).forEach(m => {
                batch.set(getCollectionRef("finance").doc(m), state.finance[m]);
            });

            // Batch writes for Student Attendance
            Object.keys(state.studentAttendance || {}).forEach(d => {
                batch.set(getCollectionRef("studentAttendance").doc(d), state.studentAttendance[d]);
            });

            // Branding profile
            batch.set(getCollectionRef("branding").doc("current"), state.branding);

            // Audit Logs
            batch.set(getCollectionRef("logs").doc("current"), { logsList: state.logs });

            // Security Passwords
            if (state.passwords) {
                batch.set(getCollectionRef("security").doc("passwords"), state.passwords);
            }

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
                    studentAttendance: parsed.studentAttendance || {},
                    branding: parsed.branding || { ...DEFAULT_BRANDING },
                    logs: parsed.logs || [],
                    passwords: parsed.passwords || { admin: "admin123", clerk: "clerk123", faculty: "faculty123" }
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
                    logs: state.logs,
                    passwords: state.passwords
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

        safeFirestoreWrite("logs", "current", { logsList: state.logs });
    };

    AuraStore.clearLogs = function() {
        state.logs = [];
        AuraStore.saveState();
        AuraStore.logActivity("System activity logs cleared.", "info");

        safeFirestoreWrite("logs", "current", { logsList: [] });
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

        safeFirestoreWrite("branding", "current", state.branding);
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

        safeFirestoreWrite("staff", staffObj.id, staffObj);

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

        safeFirestoreWrite("staff", id, state.staff[index]);

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

        safeFirestoreWrite("staff", id, null, "delete");
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

        safeFirestoreWrite("attendance", dateStr, records);
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

        safeFirestoreWrite("payroll", key, state.payroll[key]);

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

        safeFirestoreWrite("payroll", key, state.payroll[key]);
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

        safeFirestoreWrite("payroll", key, state.payroll[key]);
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
            state.staff.forEach(s => getCollectionRef("staff").doc(s.id).delete().catch(e => console.error(e)));
            state.students.forEach(s => getCollectionRef("students").doc(s.id).delete().catch(e => console.error(e)));
            state.inventory.forEach(i => getCollectionRef("inventory").doc(i.id).delete().catch(e => console.error(e)));
            state.courses.forEach(c => getCollectionRef("courses").doc(c.name).delete().catch(e => console.error(e)));
            Object.keys(state.attendance).forEach(d => getCollectionRef("attendance").doc(d).delete().catch(e => console.error(e)));
            Object.keys(state.payroll).forEach(k => getCollectionRef("payroll").doc(k).delete().catch(e => console.error(e)));
            Object.keys(state.finance).forEach(k => getCollectionRef("finance").doc(k).delete().catch(e => console.error(e)));
            Object.keys(state.studentAttendance || {}).forEach(d => getCollectionRef("studentAttendance").doc(d).delete().catch(e => console.error(e)));
            getCollectionRef("branding").doc("current").set(DEFAULT_BRANDING).catch(e => console.error(e));
            getCollectionRef("logs").doc("current").set({ logsList: [] }).catch(e => console.error(e));
            getCollectionRef("security").doc("passwords").set({ admin: "admin123", clerk: "clerk123", faculty: "faculty123" }).catch(e => console.error(e));
        }

        state = {
            staff: [],
            attendance: {},
            payroll: {},
            students: [],
            courses: [],
            inventory: [],
            finance: {},
            studentAttendance: {},
            branding: { ...DEFAULT_BRANDING },
            logs: [],
            passwords: { admin: "admin123", clerk: "clerk123", faculty: "faculty123" }
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

        safeFirestoreWrite("courses", courseObj.name, courseObj);
    };

    AuraStore.deleteCourse = function(name) {
        if (!state.courses) return;
        const index = state.courses.findIndex(c => c.name === name);
        if (index !== -1) {
            state.courses.splice(index, 1);
            AuraStore.saveState();
            AuraStore.logActivity(`Removed course ${name}.`, "danger");

        safeFirestoreWrite("courses", name, null, "delete");
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
        
        // Initialize payments array if missing
        if (!studentObj.payments || studentObj.payments.length === 0) {
            studentObj.payments = [{
                id: "PAY-" + Date.now().toString().slice(-6),
                amount: Number(studentObj.amountReceived) || 0,
                date: studentObj.enrollmentDate || new Date().toISOString().split('T')[0],
                feeType: studentObj.feeType || ["New Registration"],
                remarks: studentObj.remarks || "Initial registration payment"
            }];
        }
        
        state.students.push(studentObj);
        AuraStore.saveState();
        AuraStore.logActivity(`Enrolled student ${studentObj.name} (${studentObj.id}) for ${studentObj.course}`, "success");

        safeFirestoreWrite("students", studentObj.id, studentObj);

        return studentObj;
    };

    AuraStore.updateStudent = function(id, updatedFields) {
        if (!state.students) return;
        const index = state.students.findIndex(s => s.id === id);
        if (index === -1) {
            throw new Error("Student not found.");
        }
        updatedFields.lastUpdated = Date.now();
        
        const oldStudent = state.students[index];
        let payments = oldStudent.payments || [];
        if (payments.length === 0 && (Number(oldStudent.amountReceived) || 0) > 0) {
            payments = [{
                id: "PAY-" + Date.now().toString().slice(-6),
                amount: Number(oldStudent.amountReceived) || 0,
                date: oldStudent.enrollmentDate || new Date(oldStudent.lastUpdated || Date.now()).toISOString().split('T')[0],
                feeType: oldStudent.feeType || ["New Registration"],
                remarks: oldStudent.remarks || "Legacy initial payment"
            }];
        }
        
        const newAmount = Number(updatedFields.amountReceived) || 0;
        const sumPayments = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
        
        if (newAmount !== sumPayments) {
            if (newAmount > sumPayments) {
                payments.push({
                    id: "PAY-" + Date.now().toString().slice(-6),
                    amount: newAmount - sumPayments,
                    date: updatedFields.enrollmentDate || new Date().toISOString().split('T')[0],
                    feeType: updatedFields.feeType || ["Due fee"],
                    remarks: "Form direct edit adjustment"
                });
            } else {
                if (payments.length > 0) {
                    payments[0].amount = newAmount;
                    payments = payments.filter((p, i) => i === 0 || p.amount > 0);
                }
            }
        }
        
        updatedFields.payments = payments;
        state.students[index] = { ...state.students[index], ...updatedFields };
        AuraStore.saveState();
        AuraStore.logActivity(`Updated details for student ${state.students[index].name} (${id})`, "info");

        safeFirestoreWrite("students", id, state.students[index]);

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

        safeFirestoreWrite("students", id, null, "delete");
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

        safeFirestoreWrite("inventory", itemObj.id, itemObj);

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

        safeFirestoreWrite("inventory", id, state.inventory[index]);

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

        safeFirestoreWrite("inventory", id, null, "delete");
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
        const pwdObj = state.passwords || {
            admin: "admin123",
            clerk: "clerk123",
            faculty: "faculty123"
        };
        if (username === "admin" && password === pwdObj.admin) {
            sessionStorage.setItem(SESSION_KEY, "true");
            sessionStorage.setItem(ROLE_KEY, "admin");
            AuraStore.logActivity("Administrator session authenticated.", "success");
            return true;
        } else if (username === "clerk" && password === pwdObj.clerk) {
            sessionStorage.setItem(SESSION_KEY, "true");
            sessionStorage.setItem(ROLE_KEY, "staff");
            AuraStore.logActivity("Staff session authenticated.", "success");
            return true;
        } else if (username === "faculty" && password === pwdObj.faculty) {
            sessionStorage.setItem(SESSION_KEY, "true");
            sessionStorage.setItem(ROLE_KEY, "faculty");
            AuraStore.logActivity("Faculty session authenticated.", "success");
            return true;
        }
        AuraStore.logActivity(`Failed login attempt for user: ${username}`, "warning");
        return false;
    };

    AuraStore.logout = function() {
        sessionStorage.removeItem(SESSION_KEY);
        sessionStorage.removeItem(ROLE_KEY);
        AuraStore.currentTenantId = null;
        AuraStore.stopFirebaseListeners();
        AuraStore.logActivity("Session terminated.", "info");

        if (AuraStore.useFirebase && typeof firebase !== "undefined" && firebase.auth) {
            firebase.auth().signOut().catch(e => console.error("Signout error:", e));
        }
    };

    AuraStore.getPasswords = function() {
        return state.passwords || { admin: "admin123", clerk: "clerk123", faculty: "faculty123" };
    };

    AuraStore.changePassword = function(role, newPassword) {
        if (!state.passwords) {
            state.passwords = { admin: "admin123", clerk: "clerk123", faculty: "faculty123" };
        }
        state.passwords[role] = newPassword;
        AuraStore.saveState();
        AuraStore.logActivity(`Changed password for role: ${role}`, "success");

        safeFirestoreWrite("security", "passwords", state.passwords);
    };

    AuraStore.fetchUserProfile = async function(user) {
        if (!AuraStore.db) return null;
        const email = user.email ? user.email.toLowerCase().trim() : "";
        
        // 1. Try exact lowercase email document ID
        if (email) {
            let doc = await AuraStore.db.collection("users").doc(email).get();
            if (doc.exists) return doc.data();
        }
        
        // 2. Try UID document ID
        let doc = await AuraStore.db.collection("users").doc(user.uid).get();
        if (doc.exists) return doc.data();
        
        // 3. Fallback: Query collection by email field
        if (email) {
            try {
                const snapshot = await AuraStore.db.collection("users").where("email", "==", email).get();
                if (!snapshot.empty) {
                    return snapshot.docs[0].data();
                }
            } catch (err) {
                console.error("Firestore email fallback query error:", err);
            }
        }
        
        return null;
    };

    AuraStore.fetchTenantConfig = async function(tenantId) {
        if (!AuraStore.db || !tenantId) return null;
        const doc = await AuraStore.db.collection("tenants").doc(tenantId).collection("config").doc("current").get();
        if (doc.exists) return doc.data();
        return null;
    };

    AuraStore.getMonthlyFinance = function(monthKey) {
        const defaultFin = { lightBill: 0, waterBill: 0, otherExpenses: 0, otherExpensesDetails: "", otherIncomeList: [] };
        const fin = state.finance[monthKey];
        if (!fin) return defaultFin;
        
        // Migrate legacy otherIncome to otherIncomeList if needed
        if (fin.otherIncomeList === undefined) {
            fin.otherIncomeList = [];
            if (Number(fin.otherIncome) > 0) {
                fin.otherIncomeList.push({
                    id: "INC-" + Date.now().toString().slice(-6),
                    amount: Number(fin.otherIncome),
                    date: `${monthKey}-01`,
                    source: fin.otherIncomeDetails || "Legacy Other Income"
                });
            }
        }
        return fin;
    };

    AuraStore.saveMonthlyFinance = function(monthKey, data) {
        const existing = state.finance[monthKey] || {};
        state.finance[monthKey] = {
            lightBill: Number(data.lightBill) || 0,
            waterBill: Number(data.waterBill) || 0,
            otherExpenses: Number(data.otherExpenses) || 0,
            otherExpensesDetails: data.otherExpensesDetails || "",
            otherIncomeList: data.otherIncomeList || existing.otherIncomeList || [],
            lastUpdated: Date.now()
        };
        AuraStore.saveState();
        AuraStore.logActivity(`Saved financial expenses for ${monthKey}`, "success");

        safeFirestoreWrite("finance", monthKey, state.finance[monthKey]);
    };

    AuraStore.addOtherIncome = function(monthKey, item) {
        if (!state.finance[monthKey]) {
            state.finance[monthKey] = { lightBill: 0, waterBill: 0, otherExpenses: 0, otherExpensesDetails: "", otherIncomeList: [] };
        }
        const fin = state.finance[monthKey];
        if (!fin.otherIncomeList) fin.otherIncomeList = [];
        
        item.id = item.id || "INC-" + Date.now().toString().slice(-6);
        item.amount = Number(item.amount) || 0;
        fin.otherIncomeList.push(item);
        fin.lastUpdated = Date.now();
        
        AuraStore.saveState();
        AuraStore.logActivity(`Added other income ₹${item.amount} (${item.source}) for ${monthKey}`, "success");
        
        safeFirestoreWrite("finance", monthKey, fin);
        return fin;
    };
    
    AuraStore.deleteOtherIncome = function(monthKey, itemId) {
        const fin = state.finance[monthKey];
        if (!fin || !fin.otherIncomeList) return;
        
        const idx = fin.otherIncomeList.findIndex(i => i.id === itemId);
        if (idx !== -1) {
            const amount = fin.otherIncomeList[idx].amount;
            const source = fin.otherIncomeList[idx].source;
            fin.otherIncomeList.splice(idx, 1);
            fin.lastUpdated = Date.now();
            
            AuraStore.saveState();
            AuraStore.logActivity(`Deleted other income ₹${amount} (${source}) for ${monthKey}`, "warning");
            
        safeFirestoreWrite("finance", monthKey, fin);
        }
    };

    AuraStore.getAllFinance = function() {
        return state.finance || {};
    };

    AuraStore.getStudentAttendanceByDate = function(dateStr) {
        return state.studentAttendance[dateStr] || {};
    };

    AuraStore.saveStudentAttendance = function(dateStr, records) {
        Object.keys(records).forEach(studentId => {
            records[studentId].lastUpdated = Date.now();
        });
        state.studentAttendance[dateStr] = records;
        AuraStore.saveState();
        AuraStore.logActivity(`Saved student attendance registers for ${dateStr}.`, "success");

        safeFirestoreWrite("studentAttendance", dateStr, records);
    };

    AuraStore.recordStudentPayment = function(studentId, paymentObj) {
        if (!state.students) return;
        const index = state.students.findIndex(s => s.id === studentId);
        if (index === -1) {
            throw new Error("Student not found.");
        }
        const student = state.students[index];
        if (!student.payments) {
            student.payments = [];
        }
        
        const amount = Number(paymentObj.amount) || 0;
        paymentObj.id = paymentObj.id || "PAY-" + Date.now().toString().slice(-6);
        paymentObj.amount = amount;
        
        student.payments.push(paymentObj);
        student.amountReceived = (Number(student.amountReceived) || 0) + amount;
        student.dueAmount = Math.max(0, (Number(student.courseFee) || 0) - student.amountReceived);
        student.lastUpdated = Date.now();
        
        AuraStore.saveState();
        AuraStore.logActivity(`Recorded payment of ₹${amount} for student ${student.name} (${studentId})`, "success");
        
        safeFirestoreWrite("students", studentId, student);
        
        return student;
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

    AuraStore.migrateRootToTenant = async function(tenantId) {
        if (!AuraStore.db) {
            console.error("Firebase is not connected.");
            return "Firebase is not connected.";
        }
        
        console.log(`Starting migration from root collections to tenant: '${tenantId}'...`);
        const db = AuraStore.db;
        
        const collections = [
            "staff", "students", "inventory", "courses", 
            "attendance", "payroll", "finance", "studentAttendance"
        ];
        
        for (const col of collections) {
            try {
                console.log(`Migrating collection: ${col}...`);
                const snapshot = await db.collection(col).get();
                if (snapshot.empty) {
                    console.log(`Collection ${col} is empty.`);
                    continue;
                }
                
                const targetRef = db.collection("tenants").doc(tenantId).collection(col === "branding" ? "config" : col);
                const batch = db.batch();
                let count = 0;
                
                snapshot.forEach(doc => {
                    batch.set(targetRef.doc(doc.id), doc.data());
                    count++;
                });
                
                await batch.commit();
                console.log(`Successfully migrated ${count} documents for ${col}.`);
            } catch (err) {
                console.error(`Error migrating collection ${col}:`, err);
            }
        }
        
        // Migrate branding doc
        try {
            console.log("Migrating branding/current...");
            const doc = await db.collection("branding").doc("current").get();
            if (doc.exists) {
                await db.collection("tenants").doc(tenantId).collection("config").doc("current").set(doc.data());
                console.log("Successfully migrated branding/current.");
            }
        } catch (err) {
            console.error("Error migrating branding:", err);
        }

        // Migrate logs doc
        try {
            console.log("Migrating logs/current...");
            const doc = await db.collection("logs").doc("current").get();
            if (doc.exists) {
                await db.collection("tenants").doc(tenantId).collection("logs").doc("current").set(doc.data());
                console.log("Successfully migrated logs/current.");
            }
        } catch (err) {
            console.error("Error migrating logs:", err);
        }

        // Migrate passwords doc
        try {
            console.log("Migrating security/passwords...");
            const doc = await db.collection("security").doc("passwords").get();
            if (doc.exists) {
                await db.collection("tenants").doc(tenantId).collection("security").doc("passwords").set(doc.data());
                console.log("Successfully migrated security/passwords.");
            }
        } catch (err) {
            console.error("Error migrating security passwords:", err);
        }

        console.log("Migration complete!");
        return "Migration complete!";
    };

    AuraStore.migrateTenantToTenant = async function(fromTenantId, toTenantId) {
        if (!AuraStore.db) {
            console.error("Firebase is not connected.");
            return "Firebase is not connected.";
        }
        
        console.log(`Starting migration from tenant '${fromTenantId}' to tenant '${toTenantId}'...`);
        const db = AuraStore.db;
        
        const collections = [
            "staff", "students", "inventory", "courses", 
            "attendance", "payroll", "finance", "studentAttendance"
        ];
        
        for (const col of collections) {
            try {
                console.log(`Migrating collection: ${col}...`);
                const sourceRef = db.collection("tenants").doc(fromTenantId).collection(col === "branding" ? "config" : col);
                const snapshot = await sourceRef.get();
                if (snapshot.empty) {
                    console.log(`Collection ${col} is empty in source tenant.`);
                    continue;
                }
                
                const targetRef = db.collection("tenants").doc(toTenantId).collection(col === "branding" ? "config" : col);
                const batch = db.batch();
                let count = 0;
                
                snapshot.forEach(doc => {
                    batch.set(targetRef.doc(doc.id), doc.data());
                    count++;
                });
                
                await batch.commit();
                console.log(`Successfully migrated ${count} documents for ${col}.`);
            } catch (err) {
                console.error(`Error migrating collection ${col}:`, err);
            }
        }
        
        // Migrate branding config doc
        try {
            console.log("Migrating branding/current...");
            const doc = await db.collection("tenants").doc(fromTenantId).collection("config").doc("current").get();
            if (doc.exists) {
                await db.collection("tenants").doc(toTenantId).collection("config").doc("current").set(doc.data());
                console.log("Successfully migrated branding/current.");
            }
        } catch (err) {
            console.error("Error migrating branding:", err);
        }

        // Migrate logs doc
        try {
            console.log("Migrating logs/current...");
            const doc = await db.collection("tenants").doc(fromTenantId).collection("logs").doc("current").get();
            if (doc.exists) {
                await db.collection("tenants").doc(toTenantId).collection("logs").doc("current").set(doc.data());
                console.log("Successfully migrated logs/current.");
            }
        } catch (err) {
            console.error("Error migrating logs:", err);
        }

        // Migrate passwords doc
        try {
            console.log("Migrating security/passwords...");
            const doc = await db.collection("tenants").doc(fromTenantId).collection("security").doc("passwords").get();
            if (doc.exists) {
                await db.collection("tenants").doc(toTenantId).collection("security").doc("passwords").set(doc.data());
                console.log("Successfully migrated security/passwords.");
            }
        } catch (err) {
            console.error("Error migrating security passwords:", err);
        }

        console.log("Migration complete!");
        return "Migration complete!";
    };

    AuraStore.createTenant = async function(tenantId, adminEmail, name, theme = "#6366f1", owner = "", phone = "", address = "", password = "", logoBase64 = null) {
        if (!AuraStore.db) {
            console.error("Firebase is not connected.");
            return { success: false, message: "Firebase is not connected." };
        }
        
        tenantId = tenantId.toLowerCase().trim();
        adminEmail = adminEmail.toLowerCase().trim();
        
        console.log(`Creating tenant config for '${tenantId}'...`);
        const db = AuraStore.db;
        
        // 1. Create tenant config document
        const configData = {
            name: name || (tenantId.charAt(0).toUpperCase() + tenantId.slice(1) + " Coaching Institute"),
            tagline: "Unlocking Academic Excellence",
            email: adminEmail,
            phone: phone || "9876543210",
            address: address || "Beawar",
            theme: theme,
            logo: logoBase64 || "icons/logo.png",
            owner: owner || "Administrator",
            active: true
        };
        
        // 2. Create user document (store password so super admin can manage it)
        const userData = {
            email: adminEmail,
            role: "admin",
            tenant_id: tenantId,
            tenantId: tenantId,
            password: password || "admin123",
            owner: owner || "Administrator"
        };
        
        try {
            // Write tenant config
            await db.collection("tenants").doc(tenantId).collection("config").doc("current").set(configData);
            
            // Write user profile
            await db.collection("users").doc(adminEmail).set(userData);
            
            // Create Firebase Auth account if password is provided
            if (password) {
                console.log(`Creating Firebase Auth account for '${adminEmail}'...`);
                const configStr = localStorage.getItem("aurastaff_firebase_config");
                if (configStr) {
                    const configObj = JSON.parse(configStr);
                    // Initialize a secondary app instance specifically for creating this user
                    const secAppName = "auth-creator-" + Date.now();
                    const secondaryApp = firebase.initializeApp(configObj, secAppName);
                    try {
                        await secondaryApp.auth().createUserWithEmailAndPassword(adminEmail, password);
                        console.log("Firebase Auth account created successfully.");
                    } catch (authErr) {
                        console.warn("Firebase Auth account creation warning (might already exist):", authErr.message);
                    } finally {
                        await secondaryApp.delete();
                    }
                }
            }
            
            console.log(`Tenant '${tenantId}' successfully configured!`);
            return { success: true, message: `Tenant '${tenantId}' successfully configured!` };
        } catch (err) {
            console.error("Error creating tenant:", err);
            return { success: false, message: err.message };
        }
    };

    AuraStore.getRegisteredInstitutes = async function() {
        if (!AuraStore.db) return [];
        try {
            const usersSnapshot = await AuraStore.db.collection("users").where("role", "==", "admin").get();
            const list = [];
            for (const doc of usersSnapshot.docs) {
                const userData = doc.data();
                const tenantId = userData.tenant_id || userData.tenantId;
                if (!tenantId) continue;
                
                // Fetch tenant config
                let config = null;
                try {
                    const configDoc = await AuraStore.db.collection("tenants").doc(tenantId).collection("config").doc("current").get();
                    if (configDoc.exists) {
                        config = configDoc.data();
                    }
                } catch (configErr) {
                    console.warn(`Could not load config for tenant ${tenantId}:`, configErr);
                }
                
                list.push({
                    email: userData.email || doc.id,
                    tenantId: tenantId,
                    password: userData.password || "admin123",
                    owner: config ? (config.owner || userData.owner || "") : "",
                    name: config ? (config.name || "") : (tenantId.toUpperCase()),
                    theme: config ? (config.theme || "#6366f1") : "#6366f1",
                    logo: config ? (config.logo || "icons/logo.png") : "icons/logo.png",
                    address: config ? (config.address || "") : "",
                    phone: config ? (config.phone || "") : "",
                    active: config ? (config.active !== false) : true
                });
            }
            return list;
        } catch (err) {
            console.error("Error fetching registered institutes:", err);
            return [];
        }
    };

    AuraStore.updateAdminPassword = async function(adminEmail, tenantId, oldPassword, newPassword) {
        if (!AuraStore.db) {
            console.error("Firebase is not connected.");
            return { success: false, message: "Firebase is not connected." };
        }
        
        adminEmail = adminEmail.toLowerCase().trim();
        const db = AuraStore.db;
        
        try {
            // 1. Update password field in Firestore /users/{email} doc
            await db.collection("users").doc(adminEmail).update({ password: newPassword });
            
            // 2. Try to update password in Firebase Auth using the secondary app
            const configStr = localStorage.getItem("aurastaff_firebase_config");
            if (configStr) {
                const configObj = JSON.parse(configStr);
                const secAppName = "auth-updater-" + Date.now();
                const secondaryApp = firebase.initializeApp(configObj, secAppName);
                try {
                    // Sign in as the admin user using their old password
                    await secondaryApp.auth().signInWithEmailAndPassword(adminEmail, oldPassword);
                    // Update password
                    if (secondaryApp.auth().currentUser) {
                        await secondaryApp.auth().currentUser.updatePassword(newPassword);
                        console.log("Firebase Auth password updated successfully.");
                    }
                } catch (authErr) {
                    console.warn("Firebase Auth password update failed (trying bypass or create user fallback):", authErr.message);
                    
                    // Fallback: If sign-in failed (maybe Auth user doesn't exist yet), let's try creating them
                    try {
                        await secondaryApp.auth().createUserWithEmailAndPassword(adminEmail, newPassword);
                        console.log("Fallback: Created missing Firebase Auth account during password change.");
                    } catch (createErr) {
                        console.error("Auth creation fallback failed:", createErr);
                        return { success: false, message: "Could not update Firebase Authentication credentials: " + authErr.message };
                    }
                } finally {
                    await secondaryApp.delete();
                }
            }
            return { success: true, message: "Password updated successfully!" };
        } catch (err) {
            console.error("Error updating admin password:", err);
            return { success: false, message: err.message };
        }
    };

    AuraStore.updateTenantDetails = async function(tenantId, adminEmail, name, theme, owner, phone, address, logoBase64) {
        if (!AuraStore.db) return { success: false, message: "Firebase is not connected." };
        try {
            const db = AuraStore.db;
            const configRef = db.collection("tenants").doc(tenantId).collection("config").doc("current");
            const updateData = {
                name: name,
                theme: theme,
                owner: owner,
                phone: phone,
                address: address
            };
            if (logoBase64) {
                updateData.logo = logoBase64;
            }
            await configRef.update(updateData);
            
            // Also update owner in users profile
            await db.collection("users").doc(adminEmail).update({ owner: owner });
            
            return { success: true, message: "Institute details updated successfully!" };
        } catch (err) {
            console.error("Error updating tenant details:", err);
            return { success: false, message: err.message };
        }
    };

    AuraStore.toggleTenantStatus = async function(tenantId, active) {
        if (!AuraStore.db) return { success: false, message: "Firebase is not connected." };
        try {
            const db = AuraStore.db;
            await db.collection("tenants").doc(tenantId).collection("config").doc("current").update({
                active: active
            });
            return { success: true, message: `Tenant status updated to ${active ? 'Active' : 'Inactive'} successfully!` };
        } catch (err) {
            console.error("Error toggling tenant status:", err);
            return { success: false, message: err.message };
        }
    };

    AuraStore.deleteTenant = async function(tenantId, adminEmail) {
        if (!AuraStore.db) return { success: false, message: "Firebase is not connected." };
        try {
            const db = firebase.firestore();
            // 1. Delete user profile
            await db.collection("users").doc(adminEmail).delete();
            // 2. Delete config
            await db.collection("tenants").doc(tenantId).collection("config").doc("current").delete();
            
            console.log(`Tenant '${tenantId}' deleted successfully.`);
            return { success: true, message: `Tenant '${tenantId}' deleted successfully.` };
        } catch (err) {
            console.error("Error deleting tenant:", err);
            return { success: false, message: err.message };
        }
    };

})();
