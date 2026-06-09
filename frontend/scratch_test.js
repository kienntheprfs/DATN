const { parseISO, format } = require('date-fns');
const d = parseISO('2026-06-09');
console.log('Parsed date:', d);
console.log('Formatted date:', format(d, 'dd/MM'));
