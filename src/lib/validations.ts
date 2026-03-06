import { z } from "zod";

export const contactSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().optional(),
  jobTitle: z.string().optional(),
  lifecycleStage: z.string().default("subscriber"),
  leadStatus: z.string().optional(),
  ownerId: z.string().optional(),
  companyId: z.string().optional(),
  source: z.string().optional(),
});

export const companySchema = z.object({
  name: z.string().min(1, "Company name is required"),
  domain: z.string().optional(),
  industry: z.string().optional(),
  size: z.string().optional(),
  revenue: z.coerce.number().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  description: z.string().optional(),
});

export const dealSchema = z.object({
  name: z.string().min(1, "Deal name is required"),
  amount: z.coerce.number().optional(),
  currency: z.string().default("USD"),
  stage: z.string().default("discovery"),
  pipeline: z.string().default("new_business"),
  probability: z.coerce.number().min(0).max(100).optional(),
  closeDate: z.string().optional(),
  ownerId: z.string().optional(),
  contactId: z.string().optional(),
  companyId: z.string().optional(),
});

export const ticketSchema = z.object({
  subject: z.string().min(1, "Subject is required"),
  description: z.string().optional(),
  status: z.string().default("open"),
  priority: z.string().default("medium"),
  category: z.string().optional(),
  pipeline: z.string().default("support"),
  contactId: z.string().optional(),
  companyId: z.string().optional(),
  assigneeId: z.string().optional(),
});

export const taskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  type: z.string().default("todo"),
  priority: z.string().default("medium"),
  status: z.string().default("pending"),
  dueDate: z.string().optional(),
  contactId: z.string().optional(),
});

export const activitySchema = z.object({
  type: z.string().min(1, "Type is required"),
  subject: z.string().optional(),
  body: z.string().optional(),
  contactId: z.string().optional(),
  dealId: z.string().optional(),
  duration: z.coerce.number().optional(),
  outcome: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const registerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const pageSchema = z.object({
  title: z.string().min(1, "Title is required"),
  slug: z.string().min(1, "Slug is required"),
  content: z.string().default("[]"),
  template: z.string().default("default"),
  status: z.string().default("draft"),
  metaTitle: z.string().optional(),
  metaDesc: z.string().optional(),
});

export const blogPostSchema = z.object({
  title: z.string().min(1, "Title is required"),
  slug: z.string().min(1, "Slug is required"),
  body: z.string().min(1, "Body is required"),
  excerpt: z.string().optional(),
  coverImage: z.string().optional(),
  author: z.string().optional(),
  tags: z.string().optional(),
  status: z.string().default("draft"),
});

export const campaignSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.string().min(1, "Type is required"),
  status: z.string().default("draft"),
  budget: z.coerce.number().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export type ContactFormData = z.infer<typeof contactSchema>;
export type CompanyFormData = z.infer<typeof companySchema>;
export type DealFormData = z.infer<typeof dealSchema>;
export type TicketFormData = z.infer<typeof ticketSchema>;
export type TaskFormData = z.infer<typeof taskSchema>;
export type ActivityFormData = z.infer<typeof activitySchema>;
export type LoginFormData = z.infer<typeof loginSchema>;
export type RegisterFormData = z.infer<typeof registerSchema>;
export type PageFormData = z.infer<typeof pageSchema>;
export type BlogPostFormData = z.infer<typeof blogPostSchema>;
export const emailTemplateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  subject: z.string().min(1, "Subject is required"),
  body: z.string().min(1, "Body is required"),
  category: z.string().optional(),
  isActive: z.boolean().default(true),
});

export const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  fields: z.string().default("[]"),
  submitLabel: z.string().default("Submit"),
  redirectUrl: z.string().optional(),
  isActive: z.boolean().default(true),
});

export const workflowSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  trigger: z.string().min(1, "Trigger is required"),
  actions: z.string().min(1, "Actions are required"),
  isActive: z.boolean().default(false),
});

export const contactListSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.string().default("static"),
  filters: z.string().optional(),
});

export const sequenceSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  steps: z.string().default("[]"),
  isActive: z.boolean().default(true),
});

export type CampaignFormData = z.infer<typeof campaignSchema>;
export type EmailTemplateFormData = z.infer<typeof emailTemplateSchema>;
export type FormFormData = z.infer<typeof formSchema>;
export type WorkflowFormData = z.infer<typeof workflowSchema>;
export type ContactListFormData = z.infer<typeof contactListSchema>;
export type SequenceFormData = z.infer<typeof sequenceSchema>;
