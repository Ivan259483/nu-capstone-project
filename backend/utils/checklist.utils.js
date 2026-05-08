export const generateOperationsChecklist = (serviceName = '') => {
  const name = serviceName.toLowerCase();
  
  const checklist = {
    ingress: [],
    egress: []
  };

  // Helper to create item objects
  const createItem = (itemName, isMustExplain = false, isRequired = true) => ({
    name: itemName,
    isMustExplain,
    isRequired,
    completed: false,
    completedAt: null
  });

  checklist.ingress.push(
    createItem('Vehicle Pre-Assessment Before Any Detailing Service', true)
  );

  // --- Identify Service Type based on Keywords ---
  if (name.includes('coating') || name.includes('paint protection')) {
    // COATING / PAINT + PPF (If it contains both, we default to the heaviest which is PPF/Coating)
    checklist.ingress.push(
      createItem('Vehicle Checklist Form', false),
      createItem('Job Order Form', true),
      createItem('Coating Expectation Form', true)
    );
    checklist.egress.push(
      createItem('QC Checklist', false),
      createItem('Offer Maintenance Spray (Yes / No)', false),
      createItem('Offer FREE Glass Cleaner (REVIEWS)', false),
      createItem('Confirm Downpayment', true),
      createItem('Acknowledgment Receipt (Big)', false),
      createItem('Acknowledgment Receipt (Small)', false),
      createItem('3% Terminal Charge (If applicable)', false),
      createItem('Aftercare Form', true),
      createItem('AUTOSPF Sticker', false),
      createItem('2nd / Final QC Checklist before release', false)
    );
  } else if (name.includes('ppf')) {
    // PPF
    checklist.ingress.push(
      createItem('PPF Agreement Form', true),
      createItem('Job Order Form', true),
      createItem('Tint Form (If applicable)', true),
      createItem('Vehicle Exterior Checklist', false),
      createItem('Vehicle Interior Checklist', false)
    );
    checklist.egress.push(
      createItem('QC Checklist', false),
      createItem('Vehicle Test Drive (PPF ONLY)', false),
      createItem('Confirm Downpayment', true),
      createItem('Acknowledgment Receipt (Big)', false),
      createItem('Acknowledgment Receipt (Small)', false),
      createItem('3% Terminal Charge (If applicable)', false),
      createItem('Aftercare Form', true),
      createItem('AUTOSPF Sticker', false),
      createItem('2nd / Final QC Checklist before release', false)
    );
  } else if (name.includes('tint')) {
    // TINT ONLY
    checklist.ingress.push(
      createItem('Vehicle Exterior Checklist Form', false),
      createItem('Tint Form', true),
      createItem('Explain: Should we remove your RFID or NO?', true),
      createItem('Explain: Dirt and defogger awareness', true),
      createItem('Explain: Handling valuables or materials inside the car', true),
      createItem('Job Order Form', true)
    );
    checklist.egress.push(
      createItem('Confirm Downpayment', true),
      createItem('Acknowledgment Receipt (Big)', false),
      createItem('Acknowledgment Receipt (Small)', false),
      createItem('DO NOT ROLL Sticker', false),
      createItem('QC Checklist - Tint', false)
    );
  } else if (name.includes('undercoat')) {
    // UNDERCOAT
    checklist.ingress.push(
      createItem('Photo Documentation (Before)', false),
      createItem('Job Order Form', true),
      createItem('Detailer Approval (Before Painting)', false),
      createItem('Photo Documentation (After)', false)
    );
  } else if (name.includes('latero')) {
    // LATERO
    checklist.ingress.push(
      createItem('Photo Documentation (Before)', false),
      createItem('Detailer/Manager Approval (Before Painting)', false),
      createItem('Photo Documentation (After)', false)
    );
  } else if (name.includes('paint')) {
    // PAINTING ONLY
    checklist.ingress.push(
      createItem('Vehicle Exterior Checklist Form', false),
      createItem('Painting Agreement Form', false),
      createItem('Job Order Form', false)
    );
  } else {
    // DEFAULT GENERIC CHECKLIST
    checklist.ingress.push(
      createItem('Vehicle Exterior / Interior Checklist', false),
      createItem('Job Order Form', true)
    );
    checklist.egress.push(
      createItem('QC Checklist', false),
      createItem('Confirm Payment', true),
      createItem('Final Walkaround Delivery', false)
    );
  }

  return checklist;
};
