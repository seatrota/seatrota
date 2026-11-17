# Team insights

The team settings page has an Insights section that every team member can read. It covers team bookings whose start time falls in the chosen range. The default range is the last 30 days through the next 30 days. The end date is not included, and a range can be at most 366 days.

- **Bookings:** every team booking in the range, in any status.
- **Cancelled:** bookings that were cancelled or rejected.
- **No-shows:** bookings where a host or a guest was marked as a no-show. A cancelled booking is never counted as a no-show. The note under the totals splits guest and host no-shows.
- **Cancellation rate:** cancelled bookings divided by all bookings.
- **No-show rate:** no-shows divided by bookings that were not cancelled.
- **Per member:**
  - *Organized* is the bookings the member was assigned to, with their cancellations and no-shows.
  - *Hosted* also counts collective bookings the member joined without organizing.
- **Round-robin distribution:** for each round-robin event type, how the active bookings split across its hosts. Hosts with no bookings are listed too.

Each booking is counted once, using its current host assignment. After a reassignment, the booking counts for the new host. No-shows are read from the booking's host no-show flag and from each attendee's no-show flag, the same fields the bookings list uses when someone is marked as a no-show.
