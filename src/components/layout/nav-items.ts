import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  UserRound,
  ConciergeBell,
  ClipboardList,
  Package,
  Wallet,
  Vault,
  TicketPercent,
  Gift,
  BarChart3,
  History,
  Settings,
  CreditCard,
} from 'lucide-react';

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Tint of the icon chip, Apple Settings–style. */
  color: string;
  group: NavGroup;
  comingSoon?: boolean;
  /** Só para dono/gerente (admin da organização); a equipe não vê no menu. */
  adminOnly?: boolean;
};

export type NavGroup = 'Visão geral' | 'Operação' | 'Gestão';

export const navGroups: NavGroup[] = ['Visão geral', 'Operação', 'Gestão'];

export const navItems: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    color: '#007aff',
    group: 'Visão geral',
  },
  { label: 'Agenda', href: '/agenda', icon: CalendarDays, color: '#ff3b30', group: 'Visão geral' },
  { label: 'Clientes', href: '/clientes', icon: Users, color: '#34c759', group: 'Operação' },
  {
    label: 'Profissionais',
    href: '/profissionais',
    icon: UserRound,
    color: '#af52de',
    group: 'Operação',
  },
  {
    label: 'Serviços',
    href: '/servicos',
    icon: ConciergeBell,
    color: '#ff9500',
    group: 'Operação',
  },
  {
    label: 'Fichas',
    href: '/fichas',
    icon: ClipboardList,
    color: '#0a84ff',
    group: 'Operação',
  },
  { label: 'Estoque', href: '/estoque', icon: Package, color: '#5856d6', group: 'Operação' },
  { label: 'Caixa', href: '/caixa', icon: Vault, color: '#34aadc', group: 'Operação' },
  {
    label: 'Financeiro',
    href: '/financeiro',
    icon: Wallet,
    color: '#30b0c7',
    group: 'Gestão',
    adminOnly: true,
  },
  {
    label: 'Marketing',
    href: '/campanhas',
    icon: TicketPercent,
    color: '#ff2d55',
    group: 'Gestão',
    adminOnly: true,
  },
  {
    label: 'Fidelidade',
    href: '/fidelidade',
    icon: Gift,
    color: '#ff9f0a',
    group: 'Gestão',
    adminOnly: true,
  },
  {
    label: 'Relatórios',
    href: '/relatorios',
    icon: BarChart3,
    color: '#5ac8fa',
    group: 'Gestão',
    adminOnly: true,
  },
  {
    label: 'Histórico',
    href: '/historico',
    icon: History,
    color: '#a2845e',
    group: 'Gestão',
    adminOnly: true,
  },
  {
    label: 'Configurações',
    href: '/configuracoes',
    icon: Settings,
    color: '#8e8e93',
    group: 'Gestão',
    adminOnly: true,
  },
  {
    label: 'Assinatura',
    href: '/assinatura',
    icon: CreditCard,
    color: '#34c759',
    group: 'Gestão',
    adminOnly: true,
  },
];
