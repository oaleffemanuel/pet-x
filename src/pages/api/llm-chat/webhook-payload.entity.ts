export interface WebhookPayload {
  account: {
    id: number;
    name: string;
  };
  additional_attributes: Record<string, unknown>;
  content_attributes: Record<string, unknown>;
  content_type: string;
  content: string;
  conversation: Conversation;
  created_at: string;
  id: number;
  inbox: {
    id: number;
    name: string;
  };
  message_type: string;
  private: boolean;
  sender: IncomingSender | OutgoingSender;
  source_id: string;
  event: string;
  attachments?: Attachment[];  // ✅ ADICIONADO
}

export interface Attachment {  // ✅ NOVA INTERFACE
  id: number;
  file_type: string;
  data_url: string;
  thumb_url?: string;
  file_size?: number;
}

export interface Conversation {
  additional_attributes: Record<string, unknown>;
  can_reply: boolean;
  channel: string;
  contact_inbox: ContactInbox;
  id: number;
  inbox_id: number;
  messages: Message[];
  labels: string[];
  meta: ConversationMeta;
  status: string;
  custom_attributes: Record<string, unknown>;
  snoozed_until: string | null;
  unread_count: number;
  first_reply_created_at: string;
  priority: string | null;
  waiting_since: number;
  agent_last_seen_at: number;
  contact_last_seen_at: number;
  last_activity_at: number;
  timestamp: number;
  created_at: number;
  updated_at: number;
}

export interface ContactInbox {
  id?: number;
  contact_id?: number;
  inbox_id?: number;
  source_id: string;
  created_at?: string;
  updated_at?: string;
  hmac_verified?: boolean;
  pubsub_token?: string;
}

export interface Message {
  id: number;
  content: string;
  account_id: number;
  inbox_id: number;
  conversation_id: number;
  message_type: number;
  created_at: number;
  updated_at: string;
  private: boolean;
  status: string;
  source_id: string;
  content_type: string;
  content_attributes: Record<string, unknown>;
  sender_type: string;
  sender_id: number;
  external_source_ids: Record<string, unknown>;
  additional_attributes: Record<string, unknown>;
  processed_message_content: string;
  sentiment: Record<string, unknown>;
  conversation: {
    assignee_id: number;
    unread_count: number;
    last_activity_at: number;
    contact_inbox: {
      source_id: string;
    };
  };
  sender: IncomingSender | OutgoingSender;
  attachments?: Attachment[];  // ✅ ADICIONADO
}

export interface IncomingSender {
  account?: {
    id: number;
    name: string;
  };
  additional_attributes: Record<string, unknown>;
  custom_attributes: Record<string, unknown>;
  email: string | null;
  id: number;
  identifier: string | null;
  name: string;
  phone_number: string | null;
  thumbnail: string;
  blocked: boolean;
  type?: string;
  avatar?: string;
}

export interface OutgoingSender {
  id: number;
  name: string;
  email: string | null;
  phone_number: string | null;
}

export interface ConversationMeta {
  sender: IncomingSender | OutgoingSender;
  assignee: {
    id: number;
    name: string;
    available_name: string;
    avatar_url: string;
    type: string;
    availability_status: string | null;
    thumbnail: string;
  };
  team: string | null;
  hmac_verified: boolean;
}