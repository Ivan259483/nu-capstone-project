export const STATUS_CONFIG: Record<string, any> = {
  pending: {
    bar: '#888780',
    bg: '#F1EFE8',
    badge: { bg: '#D3D1C7', text: '#444441' },
    label: 'Pending',
  },
  confirmed: {
    bar: '#185FA5',
    bg: '#E6F1FB',
    badge: { bg: '#B5D4F4', text: '#0C447C' },
    label: 'Confirmed',
  },
  received: {
    bar: '#BA7517',
    bg: '#FAEEDA',
    badge: { bg: '#FAC775', text: '#633806' },
    label: 'Received',
  },
  in_progress: {
    bar: '#993C1D',
    bg: '#FAECE7',
    badge: { bg: '#F5C4B3', text: '#712B13' },
    label: 'In progress',
  },
  completed: {
    bar: '#3B6D11',
    bg: '#EAF3DE',
    badge: { bg: '#C0DD97', text: '#27500A' },
    label: 'Completed',
  },
  paid: {
    bar: '#3B6D11',
    bg: '#EAF3DE',
    badge: { bg: '#C0DD97', text: '#27500A' },
    label: 'Paid',
  },
  conflict: {
    bar: '#A32D2D',
    bg: '#FCEBEB',
    badge: { bg: '#F7C1C1', text: '#791F1F' },
    label: 'Conflict',
  },
};

export default function BookingChip({ booking, onClick }: { booking: any, onClick?: (booking: any) => void }) {
  const { customerName, service, technician, time, status } = booking;
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(booking);
      }}
      style={{
        display: 'flex',
        alignItems: 'stretch',
        borderRadius: 6,
        overflow: 'hidden',
        border: '0.5px solid rgba(0,0,0,0.12)',
        height: '100%',
        cursor: 'pointer',
        transition: 'opacity 0.15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
      onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
    >
      {/* Status bar */}
      <div style={{ width: 4, background: cfg.bar, flexShrink: 0 }} />

      {/* Body */}
      <div
        style={{
          background: cfg.bg,
          padding: '3px 6px',
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: '#1a1a1a',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {customerName}
        </div>

        <div
          style={{
            fontSize: 10,
            color: '#555',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {service}{technician ? ` · ${technician}` : ''}
        </div>

        {/* Footer: time + badge */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 10, color: '#888' }}>{time}</span>
          <span
            style={{
              fontSize: 9,
              fontWeight: 600,
              padding: '1px 5px',
              borderRadius: 3,
              background: cfg.badge.bg,
              color: cfg.badge.text,
              whiteSpace: 'nowrap',
            }}
          >
            {cfg.label}
          </span>
        </div>
      </div>
    </div>
  );
}
