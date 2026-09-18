export interface TestimonialResponse {
  id: string;
  name: string;
  countryCode: string;
  rating: number;
  review: string;
  category: string | null;
  courseId: string | null;
  status: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface FaqResponse {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  sortOrder: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebsiteContentResponse {
  id: string;
  key: string;
  title: string | null;
  content: string | null;
  data: unknown;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}
