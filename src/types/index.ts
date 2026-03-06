import type {
  User,
  Contact,
  Company,
  Deal,
  Activity,
  Task,
  Ticket,
  Comment,
  Meeting,
  Quote,
  Conversation,
  Message,
  Notification,
  Campaign,
  Workflow,
  EmailTemplate,
  Form,
  FormSubmission,
  ContactList,
  Page,
  BlogPost,
  MediaAsset,
  Integration,
  Dashboard,
  DashboardWidget,
  SavedReport,
  SavedView,
  KnowledgeArticle,
  Sequence,
  SequenceEnrollment,
  InstantlyCampaign,
} from "@/generated/prisma/client";

// Re-export all Prisma types
export type {
  User,
  Contact,
  Company,
  Deal,
  Activity,
  Task,
  Ticket,
  Comment,
  Meeting,
  Quote,
  Conversation,
  Message,
  Notification,
  Campaign,
  Workflow,
  EmailTemplate,
  Form,
  FormSubmission,
  ContactList,
  Page,
  BlogPost,
  MediaAsset,
  Integration,
  Dashboard,
  DashboardWidget,
  SavedReport,
  SavedView,
  KnowledgeArticle,
  Sequence,
  SequenceEnrollment,
  InstantlyCampaign,
};

// Extended session user
export interface SessionUser {
  id: string;
  name?: string | null;
  email: string;
  image?: string | null;
  role: string;
  teamId: string | null;
}

// Auth types
declare module "next-auth" {
  interface Session {
    user: SessionUser;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: string;
    teamId: string | null;
  }
}

// API response wrapper
export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  meta?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// Common filter/sort params
export interface ListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  filters?: Record<string, string | string[]>;
}

// Deal stages
export const DEAL_STAGES = [
  "discovery",
  "proposal_sent",
  "negotiation",
  "contract_sent",
  "closed_won",
  "closed_lost",
] as const;
export type DealStage = (typeof DEAL_STAGES)[number];

// Lifecycle stages
export const LIFECYCLE_STAGES = [
  "subscriber",
  "lead",
  "mql",
  "sql",
  "opportunity",
  "customer",
  "evangelist",
] as const;
export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

// Ticket statuses
export const TICKET_STATUSES = [
  "open",
  "pending",
  "in_progress",
  "resolved",
  "closed",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

// Priority levels
export const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

// Task statuses
export const TASK_STATUSES = ["pending", "in_progress", "completed"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

// User roles
export const USER_ROLES = ["admin", "manager", "member"] as const;
export type UserRole = (typeof USER_ROLES)[number];

// Enrollment statuses
export const ENROLLMENT_STATUSES = [
  "active",
  "paused",
  "completed",
  "bounced",
  "replied",
  "unsubscribed",
] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

// Sequence channels
export const SEQUENCE_CHANNELS = ["email", "linkedin", "call", "multi"] as const;
export type SequenceChannel = (typeof SEQUENCE_CHANNELS)[number];

// Navigation item
export interface NavItem {
  label: string;
  href: string;
  icon?: string;
  children?: NavItem[];
  badge?: number;
}
