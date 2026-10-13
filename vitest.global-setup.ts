// Tests assert locale-formatted times (e.g. "03:00 PM" for 12:00Z); pin the zone so CI (UTC) matches.
export default function setup() {
  process.env.TZ = 'Europe/Moscow'
}
