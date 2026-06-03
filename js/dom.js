/* ==========================================================================
   AURASTAFF: DOM RENDERER UTILITIES
   ========================================================================== */

(function() {
    if (!window.AuraDOM) {
        window.AuraDOM = {};
    }

    // Shorthand query helper
    const $ = selector => document.querySelector(selector);

    // ==========================================================================
    // 1. Dashboard View Renderer
    // ==========================================================================
    AuraDOM.renderDashboard = function() {
        const state = AuraStore.getState();
        const activeStaff = state.staff.filter(s => s.status === "Active");
        const totalStaffCount = state.staff.length;
        const activeStaffCount = activeStaff.length;

        // 1. Update basic cards
        $("#stat-total-staff").textContent = totalStaffCount;
        $("#stat-subtext-staff").textContent = `${activeStaffCount} Active members`;

        // Get current date string for attendance
        const todayStr = new Date().toISOString().split('T')[0];
        const todayAttendance = AuraStore.getAttendanceByDate(todayStr);

        let present = 0;
        let late = 0;
        let halfDay = 0;
        let absent = 0;
        let leave = 0;

        activeStaff.forEach(emp => {
            if (todayAttendance[emp.id]) {
                const status = todayAttendance[emp.id].status;
                if (status === "Present") present++;
                else if (status === "Late") late++;
                else if (status === "Half Day") halfDay++;
                else if (status === "Absent") absent++;
                else if (status === "Paid Leave") leave++;
            } else {
                // If unmarked, default count as absent/unmarked for today's stats
                absent++;
            }
        });

        const markedCount = present + late + halfDay + absent + leave;
        const presentRate = markedCount > 0 ? Math.round(((present + late + halfDay*0.5) / markedCount) * 100) : 0;

        $("#stat-present-today").textContent = present + late;
        $("#stat-subtext-present").textContent = `${presentRate}% attendance rate`;
        $("#stat-absent-today").textContent = absent + leave;
        $("#stat-subtext-absent").textContent = `${absent} absent, ${leave} on leave`;

        // Calculate current month's estimated payroll payout
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth();
        const monthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
        
        let payrollEst = 0;
        if (state.payroll[monthKey]) {
            Object.keys(state.payroll[monthKey]).forEach(empId => {
                payrollEst += state.payroll[monthKey][empId].netSalary;
            });
        } else {
            // Fallback estimation using basic salaries
            activeStaff.forEach(s => payrollEst += Number(s.baseSalary));
        }

        $("#stat-payroll-payout").textContent = `₹${payrollEst.toLocaleString('en-IN')}`;
        $("#stat-subtext-payroll").textContent = `Estimated for ${new Date().toLocaleString('default', { month: 'long' })}`;

        // 2. Render Attendance Progress Bar & Donuts
        $("#attendance-percentage-text").textContent = `${presentRate}%`;
        $("#attendance-progress-bar").style.width = `${presentRate}%`;

        // Render donut circles
        const totalChecked = markedCount || 1;
        const pPct = Math.round((present / totalChecked) * 100);
        const lPct = Math.round(((late + halfDay) / totalChecked) * 100);
        const aPct = Math.round(((absent + leave) / totalChecked) * 100);

        const donuts = [
            { id: "donut-present", percent: pPct },
            { id: "donut-late", percent: lPct },
            { id: "donut-absent", percent: aPct }
        ];

        donuts.forEach(d => {
            const circle = $(`#${d.id}-circle`);
            const val = $(`#${d.id}-val`);
            if (circle && val) {
                circle.style.setProperty('--percent', d.percent);
                val.textContent = `${d.percent}%`;
            }
        });

        // 3. Render Department distribution stats
        const departments = ["Teaching", "Administration", "Support", "Marketing"];
        const deptColors = {
            Teaching: "var(--color-primary)",
            Administration: "var(--color-info)",
            Support: "var(--color-warning)",
            Marketing: "var(--color-danger)"
        };

        const deptContainer = $("#dept-list-container");
        deptContainer.innerHTML = "";

        departments.forEach(dept => {
            const deptStaff = state.staff.filter(s => s.department === dept);
            const count = deptStaff.length;
            const pct = totalStaffCount > 0 ? Math.round((count / totalStaffCount) * 100) : 0;

            const deptRow = document.createElement("div");
            deptRow.className = "dept-progress-bar";
            deptRow.innerHTML = `
                <div class="dept-meta">
                    <span class="dept-name">${dept}</span>
                    <span class="dept-counts text-muted">${count} Staff (${pct}%)</span>
                </div>
                <div class="dept-bar-track">
                    <div class="dept-bar-fill" style="width: ${pct}%; background-color: ${deptColors[dept] || 'var(--color-primary)'}"></div>
                </div>
            `;
            deptContainer.appendChild(deptRow);
        });

        // 4. Render Activity Logs
        const activityList = $("#recent-activity-list");
        activityList.innerHTML = "";

        if (state.logs.length === 0) {
            activityList.innerHTML = `<div class="text-muted text-center py-2" style="font-size:12px;">No activity logs recorded.</div>`;
        } else {
            state.logs.forEach(log => {
                let bulletClass = "";
                if (log.type === "success") bulletClass = "success";
                else if (log.type === "warning") bulletClass = "warning";
                else if (log.type === "danger") bulletClass = "danger";

                const logRow = document.createElement("div");
                logRow.className = "log-item";
                logRow.innerHTML = `
                    <div class="log-bullet ${bulletClass}"></div>
                    <div>
                        <p>${log.message}</p>
                        <span class="log-time">${log.time}</span>
                    </div>
                `;
                activityList.appendChild(logRow);
            });
        }
    };

    // ==========================================================================
    // 2. Staff Directory View Renderer (Grid/List mode)
    // ==========================================================================
    AuraDOM.renderDirectory = function(filters = { search: "", department: "", status: "", viewMode: "grid" }) {
        const state = AuraStore.getState();
        const gridContainer = $("#staff-directory-grid");
        gridContainer.innerHTML = "";

        // Toggle layout classes
        if (filters.viewMode === "list") {
            gridContainer.className = "staff-list-layout";
        } else {
            gridContainer.className = "staff-grid-layout";
        }

        // Apply filters
        let filteredStaff = state.staff.filter(emp => {
            const matchesSearch = filters.search === "" || 
                emp.name.toLowerCase().includes(filters.search.toLowerCase()) || 
                emp.id.toLowerCase().includes(filters.search.toLowerCase()) || 
                emp.designation.toLowerCase().includes(filters.search.toLowerCase());

            const matchesDept = filters.department === "" || emp.department === filters.department;
            const matchesStatus = filters.status === "" || emp.status === filters.status;

            return matchesSearch && matchesDept && matchesStatus;
        });

        $("#directory-count").textContent = `Staff Members (${filteredStaff.length})`;

        if (filteredStaff.length === 0) {
            gridContainer.innerHTML = `
                <div class="glass-card no-records-card">
                    <span class="material-symbols-outlined">person_search</span>
                    <h4>No Staff Records Found</h4>
                    <p>Try refining your filters or search terms, or add a new staff member.</p>
                </div>
            `;
            return;
        }

        filteredStaff.forEach(emp => {
            const initials = emp.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
            const statusClass = emp.status === "Active" ? "badge-success" : "badge-danger";
            
            const card = document.createElement("div");
            card.className = "staff-card-node";
            card.innerHTML = `
                <span class="badge ${statusClass} node-status-badge">${emp.status}</span>
                <div class="node-profile">
                    <div class="profile-avatar-circle">${initials}</div>
                </div>
                <div class="node-info">
                    <h4>${emp.name}</h4>
                    <p class="node-designation">${emp.designation}</p>
                    <span class="node-dept-pill">${emp.department}</span>
                </div>
                <div class="node-contact-lines">
                    <div class="contact-row">
                        <span class="material-symbols-outlined">call</span>
                        <span>${emp.phone}</span>
                    </div>
                    <div class="contact-row">
                        <span class="material-symbols-outlined">mail</span>
                        <span>${emp.email}</span>
                    </div>
                </div>
                <div class="node-actions">
                    <button class="btn btn-secondary btn-sm btn-view-profile" data-id="${emp.id}">Profile</button>
                    <button class="btn btn-outline btn-sm btn-edit-staff" data-id="${emp.id}">Edit</button>
                </div>
            `;
            gridContainer.appendChild(card);
        });
    };

    // ==========================================================================
    // 3. Daily Attendance Sheets Renderers
    // ==========================================================================
    AuraDOM.renderAttendanceTable = function(dateStr) {
        const state = AuraStore.getState();
        const activeStaff = state.staff.filter(s => s.status === "Active");
        const tbody = $("#attendance-table-body");
        tbody.innerHTML = "";

        const savedAttendance = AuraStore.getAttendanceByDate(dateStr);

        let present = 0;
        let late = 0;
        let halfDay = 0;
        let absent = 0;
        let leave = 0;

        if (activeStaff.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center py-4 text-muted">
                        No active staff members registered in system.
                    </td>
                </tr>
            `;
            $("#day-summary-pills").innerHTML = "";
            return;
        }

        activeStaff.forEach(emp => {
            const record = savedAttendance[emp.id] || { status: "Absent", checkIn: "", remarks: "" };
            
            // Keep status stats
            if (record.status === "Present") present++;
            else if (record.status === "Late") late++;
            else if (record.status === "Half Day") halfDay++;
            else if (record.status === "Absent") absent++;
            else if (record.status === "Paid Leave") leave++;

            const initials = emp.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

            const tr = document.createElement("tr");
            tr.dataset.staffId = emp.id;
            tr.innerHTML = `
                <td>
                    <div class="table-profile-cell">
                        <div class="table-profile-avatar">${initials}</div>
                        <div class="table-profile-details">
                            <span class="table-profile-name">${emp.name}</span>
                            <span class="table-profile-id">${emp.id} | ${emp.designation}</span>
                        </div>
                    </div>
                </td>
                <td>
                    <span class="node-dept-pill">${emp.department}</span>
                </td>
                <td>
                    <div class="attendance-toggle-row">
                        <label class="attendance-toggle-option opt-present">
                            <input type="radio" name="status-${emp.id}" value="Present" ${record.status === 'Present' ? 'checked' : ''}>
                            <span class="toggle-label-box">Present</span>
                        </label>
                        <label class="attendance-toggle-option opt-late">
                            <input type="radio" name="status-${emp.id}" value="Late" ${record.status === 'Late' ? 'checked' : ''}>
                            <span class="toggle-label-box">Late</span>
                        </label>
                        <label class="attendance-toggle-option opt-late">
                            <input type="radio" name="status-${emp.id}" value="Half Day" ${record.status === 'Half Day' ? 'checked' : ''}>
                            <span class="toggle-label-box">Half Day</span>
                        </label>
                        <label class="attendance-toggle-option opt-absent">
                            <input type="radio" name="status-${emp.id}" value="Absent" ${record.status === 'Absent' ? 'checked' : ''}>
                            <span class="toggle-label-box">Absent</span>
                        </label>
                        <label class="attendance-toggle-option opt-leave">
                            <input type="radio" name="status-${emp.id}" value="Paid Leave" ${record.status === 'Paid Leave' ? 'checked' : ''}>
                            <span class="toggle-label-box">Leave</span>
                        </label>
                    </div>
                </td>
                <td>
                    <input type="time" class="table-input-time" value="${record.checkIn || ''}" placeholder="--:--">
                </td>
                <td>
                    <input type="time" class="table-input-time table-input-timeout" value="${record.checkOut || ''}" placeholder="--:--">
                </td>
                <td>
                    <input type="text" class="table-input-comment" value="${record.remarks || ''}" placeholder="Notes/Remarks">
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Set summary counters
        $("#day-summary-pills").innerHTML = `
            <div class="summary-pill p-pres">
                <span class="material-symbols-outlined">check_circle</span>
                <span>${present} Present</span>
            </div>
            <div class="summary-pill p-half">
                <span class="material-symbols-outlined">schedule</span>
                <span>${late + halfDay} Late / Half Day</span>
            </div>
            <div class="summary-pill p-abse">
                <span class="material-symbols-outlined">cancel</span>
                <span>${absent} Absent</span>
            </div>
            <div class="summary-pill">
                <span class="material-symbols-outlined">event_busy</span>
                <span>${leave} Leave</span>
            </div>
        `;
    };

    // ==========================================================================
    // 4. Payroll Ledger Renderers
    // ==========================================================================
    AuraDOM.renderPayrollTable = function(year, month) {
        const state = AuraStore.getState();
        const activeStaff = state.staff.filter(s => s.status === "Active");
        const tbody = $("#payroll-table-body");
        tbody.innerHTML = "";

        const selectAll = $("#payroll-select-all");
        if (selectAll) {
            selectAll.checked = true;
        }

        const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
        const payrollData = state.payroll[monthKey] || {};

        let totalNet = 0;
        let totalDeduct = 0;
        let processedCount = 0;

        if (activeStaff.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="text-center py-4 text-muted">
                        No active staff members to process.
                    </td>
                </tr>
            `;
            $("#payroll-total-net").textContent = "₹0.00";
            $("#payroll-total-deductions").textContent = "₹0.00";
            $("#payroll-processed-count").textContent = "0/0";
            return;
        }

        activeStaff.forEach(emp => {
            const record = payrollData[emp.id];
            
            // If calculations haven't run or this record is undefined
            if (!record) {
                const initials = emp.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td style="text-align: center;">
                        <input type="checkbox" class="payroll-row-select" data-id="${emp.id}" checked style="cursor: pointer; width: auto; height: auto; margin: 0;">
                    </td>
                    <td>
                        <div class="table-profile-cell">
                            <div class="table-profile-avatar">${initials}</div>
                            <div class="table-profile-details">
                                <span class="table-profile-name">${emp.name}</span>
                                <span class="table-profile-id">${emp.id}</span>
                            </div>
                        </div>
                    </td>
                    <td colspan="6" class="text-muted">Payroll pending calculation. Press Refresh button above.</td>
                    <td class="text-center">-</td>
                `;
                tbody.appendChild(tr);
                return;
            }

            if (record.status === "Paid") processedCount++;
            totalNet += record.netSalary;
            totalDeduct += (record.absentDeductions + record.deductions);

            const initials = emp.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
            const statusClass = record.status === "Paid" ? "badge-success" : "badge-warning";
            const attendStats = record.leavesCount;

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="text-align: center;">
                    <input type="checkbox" class="payroll-row-select" data-id="${emp.id}" checked style="cursor: pointer; width: auto; height: auto; margin: 0;">
                </td>
                <td>
                    <div class="table-profile-cell">
                        <div class="table-profile-avatar">${initials}</div>
                        <div class="table-profile-details">
                            <span class="table-profile-name">${emp.name}</span>
                            <span class="table-profile-id">${emp.id} | ${emp.designation}</span>
                        </div>
                    </div>
                </td>
                <td>
                    <span class="badge badge-info" title="Present/Late/Half-day/Absent/Paid-Leave">
                        ${attendStats.present}P / ${attendStats.late}L / ${attendStats.halfDay}H / ${attendStats.absent}A / ${attendStats.leave}LV
                    </span>
                </td>
                <td>₹${record.baseSalary.toLocaleString('en-IN')}</td>
                <td>₹${record.allowances.toLocaleString('en-IN')}</td>
                <td>
                    <span class="${record.absentDeductions > 0 ? 'text-rose' : ''}">
                        ₹${(record.absentDeductions + record.deductions).toLocaleString('en-IN')}
                    </span>
                </td>
                <td><strong>₹${record.netSalary.toLocaleString('en-IN')}</strong></td>
                <td><span class="badge ${statusClass}">${record.status}</span></td>
                <td>
                    <div class="table-action-btn-row">
                        <button class="btn btn-outline btn-adjust-payroll" data-id="${emp.id}" title="Adjust Allowances/Deductions">
                            <span class="material-symbols-outlined">edit_document</span>
                        </button>
                        <button class="btn btn-secondary btn-payslip-preview" data-id="${emp.id}" title="View & Print Payslip">
                            <span class="material-symbols-outlined">receipt_long</span>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Set Summary Indicators
        $("#payroll-total-net").textContent = `₹${totalNet.toLocaleString('en-IN')}`;
        $("#payroll-total-deductions").textContent = `₹${totalDeduct.toLocaleString('en-IN')}`;
        $("#payroll-processed-count").textContent = `${processedCount}/${activeStaff.length}`;
    };

    // ==========================================================================
    // 5. Staff Detailed Profile Modal Renderer
    // ==========================================================================
    AuraDOM.renderStaffDetailModal = function(staffId) {
        const emp = AuraStore.getStaffById(staffId);
        if (!emp) return;

        const initials = emp.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
        const statusClass = emp.status === "Active" ? "badge-success" : "badge-danger";

        // Gather all computed historical statistics
        const state = AuraStore.getState();
        let totalLeavesYear = 0;
        let totalAbsentsYear = 0;
        
        // Sum leaves for 2026/Current Year
        Object.keys(state.attendance).forEach(date => {
            const records = state.attendance[date];
            if (records[staffId]) {
                const stat = records[staffId].status;
                if (stat === "Absent") totalAbsentsYear++;
                else if (stat === "Paid Leave") totalLeavesYear++;
            }
        });

        const detailContainer = $("#staff-detail-content");
        detailContainer.innerHTML = `
            <div class="detail-header-block">
                <div class="detail-avatar-circle">${initials}</div>
                <div class="detail-title-info">
                    <h3>${emp.name}</h3>
                    <p>${emp.designation}</p>
                    <span class="badge ${statusClass}">${emp.status}</span>
                </div>
            </div>

            <div class="detail-sections-grid">
                <!-- Personal Info Card -->
                <div class="detail-section">
                    <h4>Personal & Contact Details</h4>
                    <div class="detail-info-row">
                        <strong>Gender</strong>
                        <span>${emp.gender || 'Not specified'}</span>
                    </div>
                    <div class="detail-info-row">
                        <strong>Email</strong>
                        <span>${emp.email}</span>
                    </div>
                    <div class="detail-info-row">
                        <strong>Phone</strong>
                        <span>${emp.phone}</span>
                    </div>
                    <div class="detail-info-row">
                        <strong>Joining Date</strong>
                        <span>${new Date(emp.joiningDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </div>
                </div>

                <!-- Banking & Payout Card -->
                <div class="detail-section">
                    <h4>Salary & Banking Records</h4>
                    <div class="detail-info-row">
                        <strong>Monthly Base</strong>
                        <span>₹${Number(emp.baseSalary).toLocaleString('en-IN')}</span>
                    </div>
                    <div class="detail-info-row">
                        <strong>Salary Type</strong>
                        <span>${emp.salaryType || 'Standard'}</span>
                    </div>
                    <div class="detail-info-row">
                        <strong>Bank</strong>
                        <span>${emp.bankName || '-'}</span>
                    </div>
                    <div class="detail-info-row">
                        <strong>Acc No.</strong>
                        <span>${emp.bankAccount || '-'}</span>
                    </div>
                    <div class="detail-info-row">
                        <strong>IFSC Code</strong>
                        <span>${emp.bankIfsc || '-'}</span>
                    </div>
                </div>

                <!-- Year to Date Metrics -->
                <div class="detail-section">
                    <h4>Annual Metrics Summary (YTD)</h4>
                    <div class="detail-info-row">
                        <strong>Total Unexcused Absents</strong>
                        <span class="text-rose">${totalAbsentsYear} Days</span>
                    </div>
                    <div class="detail-info-row">
                        <strong>Approved Leaves Taken</strong>
                        <span class="text-info">${totalLeavesYear} Days</span>
                    </div>
                </div>

                <!-- Past Payroll Register Log -->
                <div class="detail-section">
                    <h4>Payroll History Log</h4>
                    <div class="history-timeline-scroll" id="detail-payroll-history">
                        <!-- Loaded dynamically -->
                    </div>
                </div>
            </div>
        `;

        // Render Payroll history items inside detail modal
        const historyContainer = $("#detail-payroll-history");
        historyContainer.innerHTML = "";
        
        let historyFound = false;
        Object.keys(state.payroll).sort().reverse().forEach(monthKey => {
            const monthRecord = state.payroll[monthKey][staffId];
            if (monthRecord) {
                historyFound = true;
                const dateObj = new Date(monthKey + "-01");
                const dateDisplay = dateObj.toLocaleDateString('default', { month: 'long', year: 'numeric' });
                
                const item = document.createElement("div");
                item.className = "history-item";
                item.innerHTML = `
                    <div class="history-item-left">
                        <span class="history-item-date">${dateDisplay}</span>
                        <span class="history-item-desc">${monthRecord.status} | Deduction: ₹${(monthRecord.absentDeductions + monthRecord.deductions).toLocaleString('en-IN')}</span>
                    </div>
                    <span class="history-item-amount">₹${monthRecord.netSalary.toLocaleString('en-IN')}</span>
                `;
                historyContainer.appendChild(item);
            }
        });

        if (!historyFound) {
            historyContainer.innerHTML = `<div class="text-muted text-center pt-4" style="font-size:12px;">No historical payslip processed for this employee yet.</div>`;
        }
    };

    // ==========================================================================
    // 6. Payslip PDF/Print Preview Generator
    // ==========================================================================
    AuraDOM.renderPayslipModal = function(staffId, year, month) {
        const emp = AuraStore.getStaffById(staffId);
        const branding = AuraStore.getBranding();
        const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
        const payrollData = AuraStore.getState().payroll[monthKey] || {};
        const payRecord = payrollData[staffId];

        if (!emp || !payRecord) return;

        const payDate = new Date(year, month, 1);
        const periodStr = payDate.toLocaleDateString('default', { month: 'long', year: 'numeric' });
        const slipNo = `SLIP-${year}${String(month+1).padStart(2, '0')}-${staffId.split('-')[1]}`;

        // Number to Words conversion for Net Salary in Indian Currency format
        function numberToWords(num) {
            const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
            const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

            if ((num = num.toString()).length > 9) return 'overflow';
            let n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
            if (!n) return '';
            let str = '';
            str += (Number(n[1]) != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + 'Crore ' : '';
            str += (Number(n[2]) != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + 'Lakh ' : '';
            str += (Number(n[3]) != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + 'Thousand ' : '';
            str += (Number(n[4]) != 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + 'Hundred ' : '';
            str += (Number(n[5]) != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) : '';
            return str ? str + 'Rupees Only' : 'Zero Rupees';
        }

        const netInWords = numberToWords(payRecord.netSalary);
        const totalEarnings = payRecord.baseSalary + payRecord.allowances;
        const totalDeductions = payRecord.absentDeductions + payRecord.deductions;

        const payslipContainer = $("#payslip-container");
        payslipContainer.innerHTML = `
            <div class="payslip-box">
                <!-- Slip Branding Header -->
                <div class="payslip-header-table">
                    <div class="payslip-brand">
                        <h2>${branding.name}</h2>
                        <p>${branding.tagline || ''}</p>
                        <p>${branding.address}</p>
                        <p>Email: ${branding.email} | Tel: ${branding.phone}</p>
                    </div>
                    <div class="payslip-title-block">
                        <h3>Salary Slip</h3>
                        <p>Pay Period: ${periodStr}</p>
                    </div>
                </div>

                <!-- Employee Metadata Grid -->
                <div class="payslip-meta-grid">
                    <div class="payslip-meta-col">
                        <div class="payslip-meta-row">
                            <strong>Staff ID:</strong>
                            <span>${emp.id}</span>
                        </div>
                        <div class="payslip-meta-row">
                            <strong>Staff Name:</strong>
                            <span>${emp.name}</span>
                        </div>
                        <div class="payslip-meta-row">
                            <strong>Designation:</strong>
                            <span>${emp.designation}</span>
                        </div>
                        <div class="payslip-meta-row">
                            <strong>Department:</strong>
                            <span>${emp.department}</span>
                        </div>
                    </div>
                    <div class="payslip-meta-col">
                        <div class="payslip-meta-row">
                            <strong>Salary Slip No:</strong>
                            <span>${slipNo}</span>
                        </div>
                        <div class="payslip-meta-row">
                            <strong>Bank Name:</strong>
                            <span>${emp.bankName || 'Not Set'}</span>
                        </div>
                        <div class="payslip-meta-row">
                            <strong>Bank Account No:</strong>
                            <span>${emp.bankAccount || 'Not Set'}</span>
                        </div>
                        <div class="payslip-meta-row">
                            <strong>IFSC Code:</strong>
                            <span>${emp.bankIfsc || 'Not Set'}</span>
                        </div>
                    </div>
                </div>

                <!-- Breakdowns Table -->
                <table class="payslip-earnings-table">
                    <thead>
                        <tr>
                            <th>Earnings / Allowances</th>
                            <th>Amount (₹)</th>
                            <th>Deductions Breakdown</th>
                            <th>Amount (₹)</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>Basic Pay</td>
                            <td>₹${payRecord.baseSalary.toLocaleString('en-IN')}</td>
                            <td>Unpaid Absents Penalty (${payRecord.leavesCount.absent} Days)</td>
                            <td>₹${payRecord.absentDeductions.toLocaleString('en-IN')}</td>
                        </tr>
                        <tr>
                            <td>Special Allowances / Bonuses</td>
                            <td>₹${payRecord.allowances.toLocaleString('en-IN')}</td>
                            <td>Additional Deductions</td>
                            <td>₹${payRecord.deductions.toLocaleString('en-IN')}</td>
                        </tr>
                        <tr class="bg-light-grey">
                            <td><strong>Total Earnings (A)</strong></td>
                            <td>₹${totalEarnings.toLocaleString('en-IN')}</td>
                            <td><strong>Total Deductions (B)</strong></td>
                            <td>₹${totalDeductions.toLocaleString('en-IN')}</td>
                        </tr>
                    </tbody>
                </table>

                <!-- Grand Totals Box -->
                <div class="payslip-totals-box">
                    <div class="totals-net-label">
                        <strong>Net Payout: ₹${payRecord.netSalary.toLocaleString('en-IN')}</strong>
                        <span>(${netInWords})</span>
                    </div>
                    <div class="totals-net-val">
                        ₹${payRecord.netSalary.toLocaleString('en-IN')}
                    </div>
                </div>

                <p style="font-size: 11px; color:#64748b; margin-top:-10px;">* Remarks: ${payRecord.remarks || 'Standard Monthly Payout'}</p>

                <!-- Signature Section -->
                <div class="payslip-signatures">
                    <div class="sig-line">
                        Employee Signature
                    </div>
                    <div class="sig-line">
                        Authorized Director Signatory
                    </div>
                </div>
            </div>
        `;
    };

    // ==========================================================================
    // 7. Student Enrollment and Course Master Renderers
    // ==========================================================================
    function recalculateStudentFees() {
        const checkboxes = document.querySelectorAll('input[name="student-course-cb"]:checked');
        let totalFee = 0;
        const selectedNames = [];
        checkboxes.forEach(cb => {
            totalFee += Number(cb.dataset.price || 0);
            selectedNames.push(cb.value);
        });

        // Update Course Fee field
        const feeInput = document.getElementById("student-course-fee");
        if (feeInput) {
            feeInput.value = totalFee;
        }

        // Update Selected Courses Text in Dropdown
        const selectedTextSpan = document.getElementById("selected-courses-text");
        if (selectedTextSpan) {
            selectedTextSpan.textContent = selectedNames.length > 0 ? selectedNames.join(", ") : "Select Courses...";
            selectedTextSpan.style.color = selectedNames.length > 0 ? "var(--text-primary)" : "var(--text-secondary)";
        }

        // Calculate Due Amount Automatically
        const amountReceivedInput = document.getElementById("student-amount-received");
        const dueAmountInput = document.getElementById("student-due-amount");
        if (dueAmountInput) {
            const amountReceived = Number(amountReceivedInput ? amountReceivedInput.value : 0) || 0;
            const dueAmount = Math.max(0, totalFee - amountReceived);
            dueAmountInput.value = dueAmount;
        }
    }
    AuraDOM.recalculateTotalCourseFee = recalculateStudentFees;

    AuraDOM.renderStudentsView = function() {
        const courses = AuraStore.getCourses();
        const students = AuraStore.getStudents();

        // 1. Render Course options checkboxes inside custom dropdown list
        const coursesListContainer = $("#student-courses-dropdown-list");
        if (coursesListContainer) {
            coursesListContainer.innerHTML = "";
            if (courses.length === 0) {
                coursesListContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 13px; padding: 10px 0;">No courses configured.</div>`;
            } else {
                courses.forEach(c => {
                    const label = document.createElement("label");
                    label.style.display = "flex";
                    label.style.alignItems = "center";
                    label.style.gap = "8px";
                    label.style.cursor = "pointer";
                    label.style.textTransform = "none";
                    label.style.fontSize = "13px";
                    label.style.padding = "6px 8px";
                    label.style.borderRadius = "4px";
                    label.style.margin = "2px 0";
                    label.style.transition = "background var(--transition-fast)";
                    label.addEventListener("mouseover", () => label.style.background = "rgba(255,255,255,0.05)");
                    label.addEventListener("mouseout", () => label.style.background = "transparent");
                    label.innerHTML = `
                        <input type="checkbox" name="student-course-cb" value="${c.name}" data-price="${c.price}" style="width:auto; height:auto; margin:0; cursor:pointer;">
                        <span style="flex-grow:1;">${c.name}</span>
                        <strong style="color: var(--color-primary);">₹${c.price.toLocaleString('en-IN')}</strong>
                    `;
                    coursesListContainer.appendChild(label);
                });

                // Attach change event listener to checkboxes
                const checkboxes = coursesListContainer.querySelectorAll('input[name="student-course-cb"]');
                checkboxes.forEach(cb => {
                    cb.addEventListener("change", recalculateStudentFees);
                });
            }
            $("#student-course-fee").value = 0;
            $("#student-due-amount").value = 0;
            const textSpan = $("#selected-courses-text");
            if (textSpan) {
                textSpan.textContent = "Select Courses...";
                textSpan.style.color = "var(--text-secondary)";
            }
        }

        // 2. Render Course list table in Course Master
        const courseListBody = $("#course-list-body");
        if (courseListBody) {
            courseListBody.innerHTML = "";
            if (courses.length === 0) {
                courseListBody.innerHTML = `
                    <tr>
                        <td colspan="3" class="text-center text-muted py-2" style="font-size:12px;">No courses configured.</td>
                    </tr>
                `;
            } else {
                courses.forEach(c => {
                    const tr = document.createElement("tr");
                    tr.innerHTML = `
                        <td><strong>${c.name}</strong></td>
                        <td>₹${c.price.toLocaleString('en-IN')}</td>
                        <td class="text-center">
                            <button class="btn btn-outline btn-sm btn-delete-course" data-name="${c.name}" style="padding: 2px 6px;" title="Delete Course">
                                <span class="material-symbols-outlined" style="font-size:16px;">delete</span>
                            </button>
                        </td>
                    `;
                    courseListBody.appendChild(tr);
                });
            }
        }

        // 3. Render Student list table
        const studentListBody = $("#student-list-body");
        if (studentListBody) {
            studentListBody.innerHTML = "";
            if (students.length === 0) {
                studentListBody.innerHTML = `
                    <tr>
                        <td colspan="11" class="text-center text-muted py-4">No enrolled students registered.</td>
                    </tr>
                `;
            } else {
                students.forEach(s => {
                    const dueAmt = Math.max(0, s.courseFee - s.amountReceived);
                    const dueDisplay = dueAmt > 0 ? `<strong class="text-rose">₹${dueAmt.toLocaleString('en-IN')}</strong>` : `<span class="text-success" style="font-weight:600;">Paid</span>`;
                    
                    const tr = document.createElement("tr");
                    tr.innerHTML = `
                        <td><strong>${s.id}</strong></td>
                        <td>${s.name}</td>
                        <td>${s.mobile || '-'}</td>
                        <td><span class="node-dept-pill" style="white-space: normal; text-align: left;">${s.course}</span></td>
                        <td>₹${s.courseFee.toLocaleString('en-IN')}</td>
                        <td>₹${s.amountReceived.toLocaleString('en-IN')}</td>
                        <td>${dueDisplay}</td>
                        <td>${s.dueDate ? new Date(s.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}</td>
                        <td>
                            ${s.feeType ? s.feeType.map(t => `<span class="badge badge-info" style="font-size:10px; margin: 1px;">${t}</span>`).join('') : ''}
                        </td>
                        <td><span style="font-size: 12px; color: var(--text-secondary); max-width: 150px; display: inline-block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${s.remarks || ''}">${s.remarks || '-'}</span></td>
                        <td class="text-center">
                            <div class="table-action-btn-row" style="justify-content: center;">
                                <button class="btn btn-sm btn-print-receipt" data-id="${s.id}" title="Print Fee Receipt" style="padding: 4px 8px; background: var(--color-success); border-color: var(--color-success); color: white;">
                                    <span class="material-symbols-outlined" style="font-size:16px;">receipt</span>
                                </button>
                                <button class="btn btn-outline btn-sm btn-edit-student" data-id="${s.id}" title="Edit details">
                                    <span class="material-symbols-outlined" style="font-size:16px;">edit</span>
                                </button>
                                <button class="btn btn-secondary btn-sm btn-delete-student" data-id="${s.id}" title="Delete enrollment">
                                    <span class="material-symbols-outlined" style="font-size:16px;">delete</span>
                                </button>
                            </div>
                        </td>
                    `;
                    studentListBody.appendChild(tr);
                });
            }
        }
    };

    // ==========================================================================
    // 7. Toast Alerts Builder
    // ==========================================================================
    let toastTimeout;
    AuraDOM.showToast = function(message, type = "success") {
        const toast = $("#toast");
        const icon = $("#toast .toast-icon");
        const text = $("#toast .toast-text");

        if (!toast) return;

        // Reset classes
        toast.className = "toast-notification";
        toast.classList.add(type);

        // Adjust icon
        if (type === "success") {
            icon.textContent = "check_circle";
        } else if (type === "error") {
            icon.textContent = "error";
        } else {
            icon.textContent = "info";
        }

        text.textContent = message;
        toast.classList.remove("hide");

        // Auto hide after 3.5s
        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            toast.classList.add("hide");
        }, 3500);
    };

    AuraDOM.printFeeReceipt = function(student) {
        const branding = window.AuraStore ? window.AuraStore.getBranding() : {
            name: "Samyak Computer Classes",
            tagline: "Unlocking Academic Excellence",
            email: "contact@samyak.edu",
            phone: "9876543210",
            address: "Above Pappu Restaurant, Chang Gate, Beawar"
        };

        const dueAmt = Math.max(0, student.courseFee - student.amountReceived);
        const receiptNo = "REC-" + Date.now().toString().slice(-6);
        const receiptDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const dueDateDisplay = student.dueDate ? new Date(student.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'N/A';

        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);

        const doc = iframe.contentWindow.document;
        doc.open();
        doc.write(`
            <html>
            <head>
                <title>Fee Receipt - ${student.name}</title>
                <style>
                    body {
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                        padding: 30px;
                        color: #1e293b;
                        background: #ffffff;
                        margin: 0;
                    }
                    .receipt-container {
                        border: 1px solid #e2e8f0;
                        padding: 30px;
                        border-radius: 12px;
                        max-width: 650px;
                        margin: 0 auto;
                        box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
                        position: relative;
                        overflow: hidden;
                    }
                    .receipt-container::before {
                        content: "";
                        position: absolute;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 6px;
                        background: linear-gradient(90deg, #6366f1, #06b6d4);
                    }
                    .header {
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-start;
                        border-bottom: 2px dashed #e2e8f0;
                        padding-bottom: 20px;
                        margin-bottom: 25px;
                    }
                    .brand-details h1 {
                        margin: 0 0 4px 0;
                        color: #4f46e5;
                        font-size: 24px;
                        font-weight: 700;
                        letter-spacing: -0.5px;
                    }
                    .brand-details p {
                        margin: 2px 0;
                        color: #64748b;
                        font-size: 13px;
                    }
                    .receipt-meta {
                        text-align: right;
                    }
                    .receipt-meta h2 {
                        margin: 0 0 6px 0;
                        color: #1e293b;
                        font-size: 18px;
                        font-weight: 600;
                    }
                    .receipt-meta p {
                        margin: 2px 0;
                        color: #64748b;
                        font-size: 12px;
                    }
                    .details-grid {
                        display: grid;
                        grid-template-columns: repeat(2, 1fr);
                        gap: 16px;
                        margin-bottom: 25px;
                        background: #f8fafc;
                        padding: 15px;
                        border-radius: 8px;
                    }
                    .detail-item {
                        font-size: 13.5px;
                        color: #334155;
                    }
                    .detail-item strong {
                        color: #64748b;
                        font-weight: 500;
                        display: inline-block;
                        width: 110px;
                    }
                    .table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-bottom: 25px;
                    }
                    .table th, .table td {
                        padding: 12px 14px;
                        text-align: left;
                        font-size: 13.5px;
                        border-bottom: 1px solid #e2e8f0;
                    }
                    .table th {
                        background-color: #f1f5f9;
                        color: #475569;
                        font-weight: 600;
                    }
                    .summary {
                        margin-left: auto;
                        width: 250px;
                        margin-bottom: 30px;
                    }
                    .summary-row {
                        display: flex;
                        justify-content: space-between;
                        padding: 6px 0;
                        font-size: 13.5px;
                        color: #475569;
                    }
                    .summary-row.total {
                        font-weight: 700;
                        font-size: 16px;
                        color: #4f46e5;
                        border-top: 1px solid #e2e8f0;
                        padding-top: 10px;
                        margin-top: 4px;
                    }
                    .bottom-row {
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-end;
                        margin-top: 10px;
                    }
                    .stamp {
                        border: 2px dashed #10b981;
                        color: #10b981;
                        display: inline-block;
                        padding: 6px 14px;
                        font-weight: 700;
                        font-size: 14px;
                        text-transform: uppercase;
                        border-radius: 6px;
                        transform: rotate(-3deg);
                        background: rgba(16, 185, 129, 0.04);
                    }
                    .stamp.partial {
                        border-color: #f59e0b;
                        color: #f59e0b;
                        background: rgba(245, 158, 11, 0.04);
                    }
                    .signature-area {
                        text-align: right;
                        font-size: 13px;
                        color: #475569;
                    }
                    .signature-line {
                        border-top: 1px solid #94a3b8;
                        width: 160px;
                        margin-bottom: 6px;
                        display: inline-block;
                    }
                    .footer {
                        text-align: center;
                        margin-top: 35px;
                        font-size: 11.5px;
                        color: #94a3b8;
                        border-top: 1px solid #f1f5f9;
                        padding-top: 15px;
                    }
                </style>
            </head>
            <body>
                <div class="receipt-container">
                    <div class="header">
                        <div class="brand-details">
                            <h1>${branding.name.toUpperCase()}</h1>
                            <p>${branding.tagline}</p>
                            <p>${branding.address}</p>
                            <p>Email: ${branding.email} | Phone: ${branding.phone}</p>
                        </div>
                        <div class="receipt-meta">
                            <h2>FEE RECEIPT</h2>
                            <p><strong>Receipt No:</strong> ${receiptNo}</p>
                            <p><strong>Date:</strong> ${receiptDate}</p>
                        </div>
                    </div>

                    <div class="details-grid">
                        <div class="detail-item"><strong>Enrollment ID:</strong> ${student.id || 'N/A'}</div>
                        <div class="detail-item"><strong>Student Name:</strong> ${student.name}</div>
                        <div class="detail-item"><strong>Mobile No:</strong> ${student.mobile || '-'}</div>
                        <div class="detail-item"><strong>Branch:</strong> ${student.branch}</div>
                        <div class="detail-item"><strong>Due Date:</strong> ${dueDateDisplay}</div>
                        <div class="detail-item" style="grid-column: span 2;"><strong>Remarks:</strong> ${student.remarks || '-'}</div>
                    </div>

                    <table class="table">
                        <thead>
                            <tr>
                                <th>Description</th>
                                <th style="text-align: right;">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>
                                    <strong>Course Enrollment:</strong> ${student.course}
                                    <div style="font-size: 11.5px; color: #64748b; margin-top: 4px;">
                                        Fee Types: ${student.feeType ? student.feeType.join(', ') : 'Registration Fee'}
                                    </div>
                                </td>
                                <td style="text-align: right; font-weight: 500;">₹${Number(student.courseFee).toLocaleString('en-IN')}</td>
                            </tr>
                        </tbody>
                    </table>

                    <div class="summary">
                        <div class="summary-row">
                            <span>Subtotal Fee</span>
                            <span>₹${Number(student.courseFee).toLocaleString('en-IN')}</span>
                        </div>
                        <div class="summary-row">
                            <span>Amount Received</span>
                            <span>₹${Number(student.amountReceived).toLocaleString('en-IN')}</span>
                        </div>
                        <div class="summary-row total">
                            <span>Balance Due</span>
                            <span>₹${dueAmt.toLocaleString('en-IN')}</span>
                        </div>
                    </div>

                    <div class="bottom-row">
                        <div>
                            ${dueAmt === 0 
                                ? '<div class="stamp">Fully Paid</div>' 
                                : '<div class="stamp partial">Partial Payment</div>'}
                        </div>
                        <div class="signature-area">
                            <div class="signature-line"></div>
                            <div>Authorized Signatory</div>
                        </div>
                    </div>

                    <div class="footer">
                        Thank you for your enrollment. This is a computer-generated fee receipt.
                    </div>
                </div>
                <script>
                    window.onload = function() {
                        window.print();
                        setTimeout(function() {
                            window.parent.document.body.removeChild(window.frameElement);
                        }, 1000);
                    }
                <\/script>
            </body>
            </html>
        `);
        doc.close();
    };

    AuraDOM.renderDashboardReport = function(filteredStudents) {
        const listBody = $("#report-students-body");
        if (!listBody) return;

        listBody.innerHTML = "";

        // 1. Recalculate metrics on the filtered dataset
        let totalExpected = 0;
        let totalCollected = 0;
        let totalDues = 0;

        if (!filteredStudents || filteredStudents.length === 0) {
            listBody.innerHTML = `
                <tr>
                    <td colspan="9" class="text-center text-muted py-4">No matching student details found for current filters.</td>
                </tr>
            `;
        } else {
            filteredStudents.forEach(s => {
                const dueAmt = Math.max(0, s.courseFee - s.amountReceived);
                totalExpected += s.courseFee || 0;
                totalCollected += s.amountReceived || 0;
                totalDues += dueAmt;

                const tr = document.createElement("tr");
                const dueDisplay = dueAmt > 0 
                    ? `<strong class="text-rose">₹${dueAmt.toLocaleString('en-IN')}</strong>` 
                    : `<span class="text-success" style="font-weight:600;">Paid</span>`;

                tr.innerHTML = `
                    <td><strong>${s.id}</strong></td>
                    <td>${s.name}</td>
                    <td>${s.mobile || '-'}</td>
                    <td><span class="node-dept-pill" style="white-space: normal; text-align: left;">${s.course}</span></td>
                    <td>₹${s.courseFee.toLocaleString('en-IN')}</td>
                    <td>₹${s.amountReceived.toLocaleString('en-IN')}</td>
                    <td>${dueDisplay}</td>
                    <td>${s.dueDate ? new Date(s.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}</td>
                    <td><span style="font-size: 12px; color: var(--text-secondary); max-width: 150px; display: inline-block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${s.remarks || ''}">${s.remarks || '-'}</span></td>
                `;
                listBody.appendChild(tr);
            });
        }

        // Update count badge
        const countBadge = $("#report-total-count");
        if (countBadge) {
            countBadge.textContent = `${filteredStudents ? filteredStudents.length : 0} Filtered`;
        }

        // Update metrics
        const totalExpectedSpan = $("#report-metric-total");
        const totalCollectedSpan = $("#report-metric-received");
        const totalDuesSpan = $("#report-metric-due");

        if (totalExpectedSpan) totalExpectedSpan.textContent = `₹${totalExpected.toLocaleString('en-IN')}`;
        if (totalCollectedSpan) totalCollectedSpan.textContent = `₹${totalCollected.toLocaleString('en-IN')}`;
        if (totalDuesSpan) totalDuesSpan.textContent = `₹${totalDues.toLocaleString('en-IN')}`;
    };

})();
