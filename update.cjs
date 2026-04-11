const fs = require('fs');

const file = '/Users/ivan/Documents/AutoSPF+/frontend/src/pages/AdminDashboard.tsx';
let text = fs.readFileSync(file, 'utf-8');

// 1. Add CheckInDialog import
if (!text.includes('CheckInDialog')) {
    text = text.replace("import { WaiversDocs } from '@/components/admin/WaiversDocs';", 
                        "import { WaiversDocs } from '@/components/admin/WaiversDocs';\nimport { CheckInDialog } from '@/components/admin/CheckInDialog';");
}

// 2. Add showCheckInModal state
if (!text.includes('showCheckInModal')) {
    text = text.replace("const [showAssignModal, setShowAssignModal] = useState(false);",
                        "const [showAssignModal, setShowAssignModal] = useState(false);\n    const [showCheckInModal, setShowCheckInModal] = useState(false);");
}

// 3. Add handleCheckInSubmit
if (!text.includes('handleCheckInSubmit')) {
    const handle_check_in_code = `
    const handleCheckInSubmit = async (amount: number, method: string, signature: string) => {
        if (!selectedBooking) return;
        const toastId = toast.loading('Processing check-in...');
        try {
            const res = await OrderService.operateCheckIn(selectedBooking.id, {
                paymentMethod: method,
                downPaymentAmount: amount,
                signature
            });
            if (res.success) {
                toast.success('Vehicle successfully checked in!');
                setShowCheckInModal(false);
                setShowAssignModal(false);
                loadData();
            } else {
                toast.error(res.message || 'Check-in failed');
            }
        } catch (e) {
            toast.error('Error during check-in');
        } finally {
            toast.dismiss(toastId);
        }
    };
`;
    // Insert before handleAssignDetailer
    text = text.replace("const handleAssignDetailer = async () => {", handle_check_in_code + "\n    const handleAssignDetailer = async () => {");
}

// 4. Rewrite handleAssignDetailer body
const old_handle_assign = `        if (user && !canAccessBookings) {
            toast.error('Insufficient permissions to manage bookings.');
            return;
        }
        if (!selectedBooking || !selectedDetailerId) return;

        const toastId = toast.loading('Assigning detailer...');

        try {
            let response = await OrderService.assignDetailer(selectedBooking.id, selectedDetailerId);

            // If the selected workflow step differs from the booking's current status, update it
            const currentStatus = selectedBooking.status || 'pending';
            if (response.success && operationalAction !== currentStatus && operationalAction !== 'assigned') {
                response = await OrderService.updateOrder(selectedBooking.id, {
                    status: operationalAction
                });
            }

            if (response.success && response.data) {
                const updated = response.data;

                // Local state update so Smart Calendar & detail drawer react instantly
                setBookings((prev) =>
                    prev.map((b) =>
                        b.id === selectedBooking.id
                            ? {
                                ...b,
                                assignedDetailer: updated.assignedDetailer,
                                status: updated.status,
                                paymentStatus: updated.paymentStatus
                            }
                            : b
                    )
                );
                setDetailBooking((prev) =>
                    prev && prev.id === selectedBooking.id
                        ? {
                            ...prev,
                            assignedDetailer: updated.assignedDetailer,
                            status: updated.status,
                            paymentStatus: updated.paymentStatus
                        }
                        : prev
                );

                // Firestore sync for Smart Calendar & customer dashboards
                const detailer = users.find(u => u.id === selectedDetailerId);
                await setDoc(doc(db, 'bookings', selectedBooking.id), {
                    status: updated.status,
                    paymentStatus: updated.paymentStatus,
                    assignedDetailer: {
                        id: detailer?.id || selectedDetailerId,
                        name: detailer?.name || updated.assignedDetailer?.name || 'Assigned Detailer',
                        email: detailer?.email || updated.assignedDetailer?.email
                    },
                    updatedAt: new Date().toISOString()
                }, { merge: true });

                // Hard refetch so any other derived widgets remain in sync
                loadData();

                setShowAssignModal(false);
                setSelectedBooking(null);
                setSelectedDetailerId('');
                setOperationalAction('assigned');
            } else {
                toast.error(response.message || 'Failed to assign detailer');
            }
        } catch (error: any) {
            console.error('Assign error:', error);
            toast.error('Error assigning detailer');
        } finally {
            // Always clear the loading toast, regardless of outcome
            toast.dismiss(toastId);
            if (operationalAction !== 'assigned') {
                toast.success(\`Detailer assigned and status updated to \${operationalAction.replace('_', ' ')}.\`);
            } else if (selectedDetailerId && selectedBooking) {
                // Only show success if we had a target booking + detailer; errors already surfaced above
                toast.success('Detailer assignment processed.');
            }
        }`;

const new_handle_assign = `        if (user && !canAccessBookings) {
            toast.error('Insufficient permissions to manage bookings.');
            return;
        }
        if (!selectedBooking) return;

        // Ensure we load users dynamically from context/state
        if (operationalAction === 'pending' || operationalAction === 'assigned' || operationalAction === 'confirmed') {
            // If the user clicks "POS Check-in" when operationalAction === 'confirmed'
            if (operationalAction === 'confirmed') {
                setShowCheckInModal(true);
                return;
            }

            if (!selectedDetailerId) return;
            const toastId = toast.loading('Assigning detailer...');
            try {
                let response = await OrderService.assignDetailer(selectedBooking.id, selectedDetailerId);
                const currentStatus = selectedBooking.status || 'pending';
                if (response.success && operationalAction !== currentStatus && operationalAction !== 'assigned') {
                    response = await OrderService.updateOrder(selectedBooking.id, {
                        status: 'confirmed'
                    });
                }
                if (response.success) {
                    toast.success('Detailer assigned.');
                    setShowAssignModal(false);
                    setSelectedBooking(null);
                    setSelectedDetailerId('');
                    loadData();
                } else {
                    toast.error(response.message || 'Failed to assign detailer');
                }
            } catch (error: any) {
                 toast.error('Error assigning detailer');
            } finally {
                toast.dismiss(toastId);
            }
            return;
        }

        const runOp = async (opName: string, opFn: (id: string) => Promise<any>, successMsg: string) => {
             const toastId = toast.loading(\`\${opName}...\`);
             try {
                  const res = await opFn(selectedBooking.id);
                  if (res.success) {
                       toast.success(successMsg);
                       setShowAssignModal(false);
                       loadData();
                  } else {
                       toast.error(res.message || \`\${opName} failed\`);
                  }
             } catch (e) {
                  toast.error(\`Error during \${opName}\`);
             } finally {
                  toast.dismiss(toastId);
             }
        };

        if (operationalAction === 'received') {
             runOp('Starting Service', OrderService.operateStartService, 'Service started successfully.');
        } else if (operationalAction === 'in_progress') {
             runOp('QC Completion', OrderService.operateQCComplete, 'QC Completed successfully.');
        } else if (operationalAction === 'completed') {
             setShowAssignModal(false);
             setActiveTab('pos');
             toast.info('Switched to POS for final payment.');
        } else if (operationalAction === 'paid') {
             runOp('Releasing Vehicle', OrderService.operateRelease, 'Vehicle Released successfully!');
        }`;

text = text.replace(old_handle_assign, new_handle_assign);

// 5. Fix validStatuses
text = text.replace("const validStatuses = ['pending', 'confirmed', 'received', 'in-progress', 'completed', 'ready_for_payment'];", 
                    "const validStatuses = ['pending', 'confirmed', 'received', 'in_progress', 'completed', 'paid', 'released'];");
        
// 6. Fix stepOrder
text = text.replace("const stepOrder = ['pending', 'confirmed', 'received', 'in-progress', 'completed', 'ready_for_payment'];",
                    "const stepOrder = ['pending', 'confirmed', 'received', 'in_progress', 'completed', 'paid', 'released'];");

// 7. Update Track Mapping arrays
const old_track = `                                            {[
                                                { id: 'pending',            label: 'Booked',      icon: Clock },
                                                { id: 'confirmed',         label: 'Confirmed',   icon: CheckCircle },
                                                { id: 'received',          label: 'Received',    icon: Car },
                                                { id: 'in-progress',       label: 'In Service',  icon: Zap },
                                                { id: 'completed',         label: 'Done',        icon: BadgeCheck },
                                                { id: 'ready_for_payment', label: 'POS',         icon: ShoppingCart },
                                            ].map((step, idx) => {`;
const new_track = `                                            {[
                                                { id: 'pending',       label: 'Booked',      icon: Clock },
                                                { id: 'confirmed',     label: 'Confirmed',   icon: CheckCircle },
                                                { id: 'received',      label: 'Received',    icon: Car },
                                                { id: 'in_progress',   label: 'In Service',  icon: Zap },
                                                { id: 'completed',     label: 'Done',        icon: BadgeCheck },
                                                { id: 'paid',          label: 'POS',         icon: ShoppingCart },
                                                { id: 'released',      label: 'Released',    icon: CheckCircle }
                                            ].map((step, idx) => {`;
text = text.replace(old_track, new_track);

// 8. Render CheckIn modal at bottom
const bottom_modal = `
            {selectedBooking && showCheckInModal && (
                <CheckInDialog
                    booking={selectedBooking}
                    isOpen={showCheckInModal}
                    onClose={() => setShowCheckInModal(false)}
                    onSubmit={handleCheckInSubmit}
                    theme={theme}
                />
            )}
        </div>
    );
}`;
if (!text.includes('<CheckInDialog')) {
    text = text.replace("        </div>\n    );\n}", bottom_modal);
}

// 9. Update the bc Mapping
const old_bc = `                                            const bc: Record<string, { label: string; icon: any }> = {
                                                'pending':            { label: 'Confirm & Assign',     icon: CheckCircle },
                                                'confirmed':          { label: 'Send to POS Check-In', icon: Send },
                                                'received':           { label: 'Start Service',        icon: Play },
                                                'in-progress':        { label: 'Mark Complete',         icon: BadgeCheck },
                                                'completed':          { label: 'Send to POS',           icon: ShoppingCart },
                                                'ready_for_payment':  { label: 'Processing...',         icon: Clock },
                                            };
                                            const cfg = bc[operationalAction] || bc['pending'];
                                            const isTerminal = operationalAction === 'ready_for_payment';
                                            const BIcon = cfg.icon;
                                            return (
                                                <Button onClick={handleAssignDetailer} disabled={!selectedDetailerId || isTerminal}`;

const new_bc = `                                            const bc: Record<string, { label: string; icon: any, needDetailer?: boolean }> = {
                                                'pending':            { label: 'Confirm & Assign',     icon: CheckCircle, needDetailer: true },
                                                'confirmed':          { label: 'POS Check-In', icon: Send, needDetailer: false },
                                                'received':           { label: 'Start Service',        icon: Play, needDetailer: false },
                                                'in_progress':        { label: 'Mark QC Complete',         icon: BadgeCheck, needDetailer: false },
                                                'completed':          { label: 'Process Final Payment',           icon: ShoppingCart, needDetailer: false },
                                                'paid':               { label: 'Release Vehicle',       icon: Send, needDetailer: false },
                                                'released':           { label: 'Released',              icon: CheckCircle, needDetailer: false },
                                            };
                                            const cfg = bc[operationalAction] || bc['pending'];
                                            const isTerminal = operationalAction === 'released';
                                            const BIcon = cfg.icon;
                                            return (
                                                <Button onClick={handleAssignDetailer} disabled={(cfg.needDetailer && !selectedDetailerId) || isTerminal}`;

text = text.replace(old_bc, new_bc);

fs.writeFileSync(file, text);
console.log('Done!');
