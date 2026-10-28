import type * as React from 'react';

export type Partner = 1 | 2;
export type PartnerColor = 'ember' | 'tide' | 'orchid' | 'moss' | 'sky' | 'cocoa' | 'graphite';
export type IconName = 'house' | 'camera' | 'users' | 'history' | 'calendar-days' | 'settings' | 'bell' | 'bell-ring' | 'check' | 'x' | 'plus' | 'minus' | 'flame' | 'trophy' | 'gift' | 'arrow-left' | 'arrow-right' | 'chevron-right' | 'chevron-down' | 'hand' | 'image' | 'image-off' | 'upload' | 'download' | 'trash-2' | 'log-out' | 'eye' | 'eye-off' | 'mail' | 'lock' | 'key-round' | 'copy' | 'link' | 'share-2' | 'refresh-cw' | 'circle-alert' | 'info' | 'triangle-alert' | 'loader-circle' | 'dumbbell' | 'heart-pulse' | 'footprints' | 'bike' | 'waves' | 'flower-2' | 'activity' | 'sun' | 'moon' | 'monitor' | 'smartphone' | 'globe' | 'target' | 'clock' | 'timer' | 'circle-check' | 'circle-x' | 'repeat' | 'ellipsis' | 'send' | 'hourglass' | 'user' | 'switch-camera';
export type DayState = 'done' | 'today' | 'missed' | 'future';
export type Status = 'done' | 'open' | 'risk' | 'missed';

export interface IconProps extends Omit<React.SVGProps<SVGSVGElement>, 'name'> { name: IconName; size?: number; title?: string }
export declare function Icon(props: IconProps): React.ReactElement | null;

export interface LogoProps { variant?: 'full' | 'mark'; size?: number; className?: string }
export declare function Logo(props: LogoProps): React.ReactElement;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'lg' | 'sm';
  icon?: IconName;
  iconOnly?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
}
export declare function Button(props: ButtonProps): React.ReactElement;

export interface FieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement & HTMLTextAreaElement>, 'prefix'> {
  label: string; hint?: string; error?: string; multiline?: boolean; prefix?: React.ReactNode; suffix?: React.ReactNode;
}
export declare function Field(props: FieldProps): React.ReactElement;

export interface SegmentedProps {
  options: { value: string; label: string; icon?: IconName }[];
  value: string; onChange?: (value: string) => void; label: string; wrap?: boolean; className?: string;
}
export declare function Segmented(props: SegmentedProps): React.ReactElement;

export interface StepperProps { value: number; min?: number; max?: number; onChange?: (value: number) => void; label: string; unit?: string; partner?: Partner; color?: PartnerColor }
export declare function Stepper(props: StepperProps): React.ReactElement;

export interface ToggleProps { checked: boolean; onChange?: (checked: boolean) => void; label: string; hint?: string; className?: string }
export declare function Toggle(props: ToggleProps): React.ReactElement;

export interface AvatarProps { partner?: Partner; color?: PartnerColor; name?: string; size?: 'sm' | 'md' | 'lg'; className?: string }
export declare function Avatar(props: AvatarProps): React.ReactElement;

export interface StatusChipProps { status?: Status; children?: React.ReactNode; className?: string }
export declare function StatusChip(props: StatusChipProps): React.ReactElement;

export interface StreakProps { weeks: number; className?: string }
export declare function Streak(props: StreakProps): React.ReactElement;

export interface CardProps extends React.HTMLAttributes<HTMLElement> { as?: React.ElementType; title?: string; action?: React.ReactNode; tone?: 'sunken' }
export declare function Card(props: CardProps): React.ReactElement;

export interface WeekStripProps { days: { label: 'Mo' | 'Di' | 'Mi' | 'Do' | 'Fr' | 'Sa' | 'So'; state: DayState }[]; partner?: Partner; color?: PartnerColor; className?: string }
export declare function WeekStrip(props: WeekStripProps): React.ReactElement;

export interface Lane { partner: Partner; color?: PartnerColor; name: string; you?: boolean; done: number; goal: number; status: Status; days: WeekStripProps['days'] }
export interface ScoreboardProps { weekLabel: string; streak?: number; lanes: Lane[]; children?: React.ReactNode; className?: string }
export declare function Scoreboard(props: ScoreboardProps): React.ReactElement;

export interface PhotoTileProps { src?: string; alt?: string; partner?: Partner; color?: PartnerColor; name?: string; dateLabel?: string; tag?: string; tagIcon?: IconName; empty?: string; className?: string }
export declare function PhotoTile(props: PhotoTileProps): React.ReactElement;

export interface DebtRowProps { debtorName: string; creditorName: string; viewerIsCreditor?: boolean; bet: string; week: string; redeemed?: boolean; onRedeem?: () => void; className?: string }
export declare function DebtRow(props: DebtRowProps): React.ReactElement;

export interface NavItem { id: string; label: string; icon: IconName; badge?: number | string; primary?: boolean }
export interface NavBarProps { items: NavItem[]; current: string; onSelect?: (id: string) => void; variant?: 'bottom' | 'side'; header?: React.ReactNode; className?: string }
export declare function NavBar(props: NavBarProps): React.ReactElement;

export interface AppBarProps { title: string; onBack?: () => void; actions?: React.ReactNode; className?: string }
export declare function AppBar(props: AppBarProps): React.ReactElement;

export interface BannerProps { tone?: 'info' | 'success' | 'warning' | 'error'; title?: string; children?: React.ReactNode; action?: React.ReactNode; className?: string }
export declare function Banner(props: BannerProps): React.ReactElement;

export interface SheetProps { open: boolean; title: string; onClose?: () => void; footer?: React.ReactNode; inline?: boolean; children?: React.ReactNode }
export declare function Sheet(props: SheetProps): React.ReactElement | null;

export interface ColorPickerProps {
  value: PartnerColor; onChange?: (value: PartnerColor) => void; partner?: Partner;
  /** Bereits vergebene Farben: Farbe → Name der Person */
  taken?: Partial<Record<PartnerColor, string>>; label?: string; colors?: { value: PartnerColor; label: string }[]; className?: string;
}
export declare const PARTNER_COLORS: { value: PartnerColor; label: string }[];
export declare function ColorPicker(props: ColorPickerProps): React.ReactElement;

export interface ShutterButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { busy?: boolean; label?: string }
export declare function ShutterButton(props: ShutterButtonProps): React.ReactElement;

declare global {
  interface Window {
    DS: { Icon: typeof Icon; Logo: typeof Logo; Button: typeof Button; Field: typeof Field; Segmented: typeof Segmented; Stepper: typeof Stepper; Toggle: typeof Toggle; Avatar: typeof Avatar; StatusChip: typeof StatusChip; Streak: typeof Streak; Card: typeof Card; WeekStrip: typeof WeekStrip; Scoreboard: typeof Scoreboard; PhotoTile: typeof PhotoTile; DebtRow: typeof DebtRow; NavBar: typeof NavBar; AppBar: typeof AppBar; Banner: typeof Banner; Sheet: typeof Sheet; ShutterButton: typeof ShutterButton; ColorPicker: typeof ColorPicker; PARTNER_COLORS: typeof PARTNER_COLORS };
  }
}
