import { FanPageSkeleton } from "@/components/ui";

/** Shown instantly while this fan page streams in, so navigation never flashes a blank or different layout. */
export default function Loading() {
  return <FanPageSkeleton />;
}
