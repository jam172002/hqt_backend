export interface CourseListItemResponse {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  suitableFor: string | null;
  ageGroup: string | null;
  status: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CourseSectionResponse {
  id: string;
  title: string;
  description: string;
  sortOrder: number;
}

export interface CourseFaqResponse {
  id: string;
  question: string;
  answer: string;
  sortOrder: number;
}

export interface CourseTeacherSummary {
  id: string;
  firstName: string;
  lastName: string;
  shortBio: string | null;
}

export interface CourseDetailResponse extends CourseListItemResponse {
  description: string;
  teachingMethod: string | null;
  classFormat: string | null;
  sections: CourseSectionResponse[];
  faqs: CourseFaqResponse[];
  teachers: CourseTeacherSummary[];
}
