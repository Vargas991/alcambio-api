type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const OFFSET_TIME_ZONE_REGEX = /^(UTC|GMT)?[+-]\d{1,2}(?::?\d{2})?$/i;

export function isValidTimeZone(timeZone: string) {
  if (OFFSET_TIME_ZONE_REGEX.test(timeZone.trim())) {
    return false;
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function getTodayInTimeZone(timeZone: string) {
  validarTimeZone(timeZone);

  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function getDateKeyInTimeZone(date: Date, timeZone: string) {
  validarTimeZone(timeZone);

  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function getUtcDayRange(fecha: string, timeZone: string) {
  validarFecha(fecha);
  validarTimeZone(timeZone);

  const [year, month, day] = fecha.split('-').map(Number);
  const siguienteDia = new Date(Date.UTC(year, month - 1, day + 1));
  const siguienteFecha = [
    siguienteDia.getUTCFullYear().toString().padStart(4, '0'),
    (siguienteDia.getUTCMonth() + 1).toString().padStart(2, '0'),
    siguienteDia.getUTCDate().toString().padStart(2, '0'),
  ].join('-');

  return {
    inicio: zonedDateTimeToUtc(fecha, timeZone),
    fin: zonedDateTimeToUtc(siguienteFecha, timeZone),
  };
}

function zonedDateTimeToUtc(fecha: string, timeZone: string) {
  const [year, month, day] = fecha.split('-').map(Number);
  const utcLocalTime = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  const firstOffset = getTimeZoneOffsetMs(new Date(utcLocalTime), timeZone);
  let utcDate = new Date(utcLocalTime - firstOffset);
  const secondOffset = getTimeZoneOffsetMs(utcDate, timeZone);

  if (firstOffset !== secondOffset) {
    utcDate = new Date(utcLocalTime - secondOffset);
  }

  return utcDate;
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = getPartsInTimeZone(date, timeZone);
  const localTimeAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  return localTimeAsUtc - date.getTime();
}

function getPartsInTimeZone(date: Date, timeZone: string): DateParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const values = new Map(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    year: values.get('year') ?? 0,
    month: values.get('month') ?? 0,
    day: values.get('day') ?? 0,
    hour: values.get('hour') ?? 0,
    minute: values.get('minute') ?? 0,
    second: values.get('second') ?? 0,
  };
}

function validarFecha(fecha: string) {
  if (!DATE_REGEX.test(fecha)) {
    throw new Error('La fecha debe tener formato YYYY-MM-DD.');
  }

  const [year, month, day] = fecha.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error('La fecha indicada no es valida.');
  }
}

function validarTimeZone(timeZone: string) {
  if (!isValidTimeZone(timeZone)) {
    throw new Error('La zona horaria no es valida.');
  }
}
