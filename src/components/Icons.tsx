import React from 'react';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Calendar,
  Call,
  Camera,
  Category,
  Chart,
  ChevronDown,
  CloseSquare,
  Discovery,
  Filter,
  Graph,
  Home,
  InfoSquare,
  Location,
  Lock,
  Login,
  Logout,
  Message,
  MoreSquare,
  Paper,
  Password,
  Scan,
  Search,
  Setting,
  ShieldDone,
  ShieldFail,
  Show,
  Star,
  Swap,
  TickSquare,
  TimeCircle,
  TwoUsers,
  User,
  Wallet,
  Work,
  Delete,
  Edit,
  Hide,
  Notification,
  VolumeUp,
  Buy,
  Danger,
  Download,
} from 'react-iconly';
import type { IconProps as IconlyProps } from 'react-iconly';

interface IconProps {
  size?: number;
  className?: string;
  strokeWidth?: number;
}

type IconlyComponent = React.FC<IconlyProps>;

const renderIconly = (
  Icon: IconlyComponent,
  { size = 20, className = '' }: IconProps,
  set: IconlyProps['set'] = 'curved'
) => (
  <span className={`inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
    <Icon size={size} set={set} stroke="regular" primaryColor="currentColor" />
  </span>
);

export const IconSearch: React.FC<IconProps> = (props) => renderIconly(Search, props);
export const IconHome: React.FC<IconProps> = (props) => renderIconly(Home, props);
export const IconUser: React.FC<IconProps> = (props) => renderIconly(User, props);
export const IconUsers: React.FC<IconProps> = (props) => renderIconly(TwoUsers, props);
export const IconCalendar: React.FC<IconProps> = (props) => renderIconly(Calendar, props);
export const IconClock: React.FC<IconProps> = (props) => renderIconly(TimeCircle, props);
export const IconWallet: React.FC<IconProps> = (props) => renderIconly(Wallet, props);
export const IconShield: React.FC<IconProps> = (props) => renderIconly(ShieldDone, props);
export const IconChart: React.FC<IconProps> = (props) => renderIconly(Graph, props);
export const IconCheck: React.FC<IconProps> = (props) => renderIconly(TickSquare, props);
export const IconCheckCircle: React.FC<IconProps> = (props) => renderIconly(TickSquare, props, 'bulk');
export const IconXCircle: React.FC<IconProps> = (props) => renderIconly(CloseSquare, props, 'bulk');
export const IconArrowRight: React.FC<IconProps> = (props) => renderIconly(ArrowRight, props);
export const IconArrowLeft: React.FC<IconProps> = (props) => renderIconly(ArrowLeft, props);
export const IconSwap: React.FC<IconProps> = (props) => renderIconly(Swap, props);
export const IconLogout: React.FC<IconProps> = (props) => renderIconly(Logout, props);
export const IconLogin: React.FC<IconProps> = (props) => renderIconly(Login, props);
export const IconPlus: React.FC<IconProps> = (props) => renderIconly(Paper, props);
export const IconScan: React.FC<IconProps> = (props) => renderIconly(Scan, props);
export const IconMapPin: React.FC<IconProps> = (props) => renderIconly(Location, props);
export const IconPhone: React.FC<IconProps> = (props) => renderIconly(Call, props);
export const IconMail: React.FC<IconProps> = (props) => renderIconly(Message, props);
export const IconChevronDown: React.FC<IconProps> = (props) => renderIconly(ChevronDown, props);
export const IconStar: React.FC<IconProps> = (props) => renderIconly(Star, props);
export const IconWifi: React.FC<IconProps> = (props) => renderIconly(Activity, props);
export const IconBolt: React.FC<IconProps> = (props) => renderIconly(Activity, props);
export const IconGrid: React.FC<IconProps> = (props) => renderIconly(Category, props);
export const IconList: React.FC<IconProps> = (props) => renderIconly(Paper, props);
export const IconMenu: React.FC<IconProps> = (props) => renderIconly(MoreSquare, props);
export const IconX: React.FC<IconProps> = (props) => renderIconly(CloseSquare, props);
export const IconFilter: React.FC<IconProps> = (props) => renderIconly(Filter, props);
export const IconEye: React.FC<IconProps> = (props) => renderIconly(Show, props);
export const IconEyeOff: React.FC<IconProps> = (props) => renderIconly(Hide, props);
export const IconLock: React.FC<IconProps> = (props) => renderIconly(Lock, props);
export const IconInfo: React.FC<IconProps> = (props) => renderIconly(InfoSquare, props);
export const IconPassword: React.FC<IconProps> = (props) => renderIconly(Password, props);
export const IconRefresh: React.FC<IconProps> = (props) => renderIconly(Swap, props);
export const IconAnalytics: React.FC<IconProps> = (props) => renderIconly(Chart, props);
export const IconCamera: React.FC<IconProps> = (props) => renderIconly(Camera, props);
export const IconShieldSuccess: React.FC<IconProps> = (props) => renderIconly(ShieldDone, props);
export const IconShieldError: React.FC<IconProps> = (props) => renderIconly(ShieldFail, props);
export const IconStatus: React.FC<IconProps> = (props) => renderIconly(Activity, props);
export const IconDatabase: React.FC<IconProps> = (props) => renderIconly(Category, props);
export const IconSettings: React.FC<IconProps> = (props) => renderIconly(Setting, props);
export const IconNotification: React.FC<IconProps> = (props) => renderIconly(Notification, props);
export const IconVolume: React.FC<IconProps> = (props) => renderIconly(VolumeUp, props);
export const IconDelete: React.FC<IconProps> = (props) => renderIconly(Delete, props);
export const IconEdit: React.FC<IconProps> = (props) => renderIconly(Edit, props);
export const IconBuy: React.FC<IconProps> = (props) => renderIconly(Buy, props);
export const IconDanger: React.FC<IconProps> = (props) => renderIconly(Danger, props);
export const IconDownload: React.FC<IconProps> = (props) => renderIconly(Download, props);
export const IconRoute: React.FC<IconProps> = (props) => renderIconly(Discovery, props);
export const IconMotorcycle: React.FC<IconProps> = (props) => renderIconly(Work, props);
export const IconLocation: React.FC<IconProps> = (props) => renderIconly(Location, props);

export const IconGoogle: React.FC<IconProps> = (props) => {
  return (
    <svg viewBox="0 0 24 24" {...props} className={props.className} style={{ width: props.size || 20, height: props.size || 20 }}>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
};

export const IconFacebook: React.FC<IconProps> = (props) => {
  return (
    <svg viewBox="0 0 24 24" {...props} className={props.className} style={{ width: props.size || 20, height: props.size || 20 }}>
      <path fill="#1877F2" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  );
};

export const IconMTN: React.FC<IconProps> = (props) => {
  return (
    <svg viewBox="0 0 24 24" {...props} className={props.className} style={{ width: props.size || 20, height: props.size || 20 }}>
      <rect width="24" height="24" rx="4" fill="#FFCB05"/>
      <text x="4" y="17" fontSize="11" fontWeight="900" fill="#003B5C" fontFamily="Arial">MTN</text>
    </svg>
  );
};
