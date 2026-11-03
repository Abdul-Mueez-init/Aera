export interface AvailabilityInterval {
  startsAt: Date;
  endsAt: Date;
}

export interface AvailabilityTechnician {
  id: string;
  intervals: AvailabilityInterval[];
  serviceIds?: string[];
}

export interface BusyInterval {
  startsAt: Date;
  endsAt: Date;
  technicianId?: string;
}

export interface AvailabilityWindow {
  startsAt: Date;
  endsAt: Date;
  capacity: number;
}

export interface ComputeWindowsInput {
  range: AvailabilityInterval;
  durationMinutes: number;
  serviceId?: string;
  technicians: AvailabilityTechnician[];
  existingJobs: BusyInterval[];
  holds: BusyInterval[];
  bufferMinutes: number;
  stepMinutes?: number;
}

function overlaps(
  left: AvailabilityInterval,
  right: AvailabilityInterval,
  bufferMinutes: number,
): boolean {
  const buffer = bufferMinutes * 60_000;
  return (
    left.startsAt.getTime() < right.endsAt.getTime() + buffer &&
    left.endsAt.getTime() + buffer > right.startsAt.getTime()
  );
}

function validDate(value: Date): boolean {
  return !Number.isNaN(value.getTime());
}

/**
 * Pure capacity calculator. All dates are instants supplied by the caller;
 * timezone conversion and wall-clock expansion belong at the API boundary.
 */
export function computeWindows(
  input: ComputeWindowsInput,
): AvailabilityWindow[] {
  if (
    !validDate(input.range.startsAt) ||
    !validDate(input.range.endsAt) ||
    input.range.endsAt <= input.range.startsAt ||
    input.durationMinutes <= 0 ||
    input.bufferMinutes < 0
  ) {
    return [];
  }

  const step = (input.stepMinutes ?? input.durationMinutes) * 60_000;
  const duration = input.durationMinutes * 60_000;
  const windows: AvailabilityWindow[] = [];

  for (
    let start = input.range.startsAt.getTime();
    start + duration <= input.range.endsAt.getTime();
    start += step
  ) {
    const candidate = {
      startsAt: new Date(start),
      endsAt: new Date(start + duration),
    };
    const capacity = input.technicians.filter((technician) => {
      if (
        input.serviceId &&
        technician.serviceIds &&
        !technician.serviceIds.includes(input.serviceId)
      ) {
        return false;
      }
      if (
        !technician.intervals.some(
          (interval) =>
            interval.startsAt <= candidate.startsAt &&
            interval.endsAt >= candidate.endsAt,
        )
      ) {
        return false;
      }
      return ![...input.existingJobs, ...input.holds].some(
        (busy) =>
          (!busy.technicianId || busy.technicianId === technician.id) &&
          overlaps(candidate, busy, input.bufferMinutes),
      );
    }).length;

    if (capacity > 0) {
      windows.push({ ...candidate, capacity });
    }
  }
  return windows;
}
