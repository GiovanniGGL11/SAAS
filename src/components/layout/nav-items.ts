import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  UserRound,
  Scissors,
  Package,
  Wallet,
  Megaphone,
  BarChart3,
  Settings,
} from 'lucide-react';

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  comingSoon?: boolean;
};

export const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Agenda', href: '/agenda', icon: CalendarDays },
  { label: 'Clientes', href: '/clientes', icon: Users },
  { label: 'Profissionais', href: '/profissionais', icon: UserRound },
  { label: 'Serviços', href: '/servicos', icon: Scissors },
  { label: 'Estoque', href: '/estoque', icon: Package, comingSoon: true },
  { label: 'Financeiro', href: '/financeiro', icon: Wallet, comingSoon: true },
  { label: 'Campanhas', href: '/campanhas', icon: Megaphone, comingSoon: true },
  { label: 'Relatórios', href: '/relatorios', icon: BarChart3, comingSoon: true },
  { label: 'Configurações', href: '/configuracoes', icon: Settings, comingSoon: true },
];
