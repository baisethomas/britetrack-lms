import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { getCoursesWithProgress, getProfile } from "@/lib/data";
import { Badge, Card, EmptyState, ProgressBar } from "@/components/ui";

export const metadata: Metadata = { title: "Courses" };

export default async function CoursesPage() {
  const profile = await getProfile();
  const courses = await getCoursesWithProgress(profile.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Course catalog</h1>
        <p className="mt-1 text-sm text-slate-500">
          Enroll in a course to start learning — your progress carries with you.
        </p>
      </div>

      {courses.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="size-10" aria-hidden />}
          title="No courses yet"
          description="Published courses will appear here. Check back soon."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {courses.map(({ course, enrollment, totalLessons, completedLessons }) => (
            <Link key={course.id} href={`/courses/${course.id}`}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-semibold">{course.title}</h2>
                  {enrollment?.completed_at ? (
                    <Badge tone="green">Completed</Badge>
                  ) : enrollment ? (
                    <Badge tone="brand">Enrolled</Badge>
                  ) : null}
                </div>
                {course.category && (
                  <Badge tone="slate" className="mt-2">
                    {course.category}
                  </Badge>
                )}
                <p className="mt-2 line-clamp-2 text-sm text-slate-600">
                  {course.description}
                </p>
                <div className="mt-4 flex items-center gap-3 text-sm text-slate-500">
                  <span>{totalLessons} lessons</span>
                  {enrollment && totalLessons > 0 && (
                    <ProgressBar
                      value={(completedLessons / totalLessons) * 100}
                      className="flex-1"
                    />
                  )}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
