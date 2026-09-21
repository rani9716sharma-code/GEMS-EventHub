import type { EventItem } from '../components/EventCard'

// UI-only starter content. Replace with backend API data in Phase 3.
export const starterEvents: EventItem[] = [
  {
    id: 'technical-workshop',
    title: 'Technical Workshop',
    department: 'Computer Science & Engineering',
    category: 'Workshop',
    date: 'To be announced',
    venue: 'Campus venue',
    feeLabel: 'Free / Paid configurable',
    status: 'Registration setup ready',
    accent: 'linear-gradient(135deg,#0b4fb3,#6f7bf7)'
  },
  {
    id: 'coding-event',
    title: 'Coding Competition',
    department: 'Open to eligible departments',
    category: 'Technical',
    date: 'To be announced',
    venue: 'Computer Lab',
    feeLabel: 'Event fee configurable',
    status: 'Eligibility rules ready',
    accent: 'linear-gradient(135deg,#0b7a63,#2db59a)'
  },
  {
    id: 'college-event',
    title: 'College Activity',
    department: 'College-wide',
    category: 'Campus',
    date: 'To be announced',
    venue: 'Campus',
    feeLabel: 'Free / Paid configurable',
    status: 'Approval workflow ready',
    accent: 'linear-gradient(135deg,#7c2d92,#d36fd6)'
  }
]
