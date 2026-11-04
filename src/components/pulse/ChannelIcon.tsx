import {
  BookOpen,
  Briefcase,
  Calendar,
  Heart,
  Home,
  Laptop,
  Megaphone,
  MessageSquare,
  Search,
  Shield,
  Trophy,
  Utensils,
} from 'lucide-react';

interface ChannelIconProps {
  icon: string;
  className?: string;
}

export function ChannelIcon({ icon, className = 'w-4 h-4' }: ChannelIconProps) {
  switch (icon) {
    case 'book':
      return <BookOpen aria-hidden="true" className={className} />;
    case 'home':
      return <Home aria-hidden="true" className={className} />;
    case 'utensils':
      return <Utensils aria-hidden="true" className={className} />;
    case 'search':
      return <Search aria-hidden="true" className={className} />;
    case 'calendar':
      return <Calendar aria-hidden="true" className={className} />;
    case 'briefcase':
      return <Briefcase aria-hidden="true" className={className} />;
    case 'megaphone':
      return <Megaphone aria-hidden="true" className={className} />;
    case 'heart':
      return <Heart aria-hidden="true" className={className} />;
    case 'shield':
      return <Shield aria-hidden="true" className={className} />;
    case 'laptop':
      return <Laptop aria-hidden="true" className={className} />;
    case 'trophy':
      return <Trophy aria-hidden="true" className={className} />;
    default:
      return <MessageSquare aria-hidden="true" className={className} />;
  }
}
