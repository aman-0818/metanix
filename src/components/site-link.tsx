import NextLink from "next/link";
import type { ComponentProps } from "react";

/** Keep marketing pages light; fetch the destination when the visitor opens it. */
export default function SiteLink(props: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={false} {...props} />;
}
