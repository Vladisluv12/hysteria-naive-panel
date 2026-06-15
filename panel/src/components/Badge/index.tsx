interface BadgeProps {
  daysLeft: number | null;
}

export function Badge({ daysLeft }: BadgeProps) {
  if (daysLeft === null || daysLeft < 0) {
    return (
      <span style={{ color: '#ef5350', fontSize: 13 }}>Expired</span>
    );
  }

  if (daysLeft === 0) {
    return (
      <span style={{ color: '#ff9800', fontSize: 13 }}>Less than 1 day</span>
    );
  }

  return (
    <span style={{ color: '#66bb6a', fontSize: 13 }}>
      {daysLeft} day{daysLeft !== 1 ? 's' : ''}
    </span>
  );
}
