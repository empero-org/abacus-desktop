/*
 * Derived from vercel/ai-elements (packages/elements/src/conversation.tsx).
 * Copyright 2023 Vercel, Inc. Licensed under Apache-2.0.
 * Modified by ZCode, and by Empero for Abacus: trimmed to the scroll container.
 * See THIRD-PARTY-NOTICES.md in the repository root for license and provenance.
 */

import { ArrowDownIcon } from "lucide-react";
import { useCallback, type ComponentProps } from "react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import { cn } from "../lib/utils.js";
import { Button } from "../ui/button.js";

export type ConversationProps = ComponentProps<typeof StickToBottom>;

export const Conversation = ({ className, ...props }: ConversationProps) => (
  <StickToBottom
    className={cn("relative flex-1 overflow-y-hidden", className)}
    // Jump, do not glide: switching threads replaces the whole transcript, and
    // an animated catch-up to the bottom reads as lag.
    initial="instant"
    resize="instant"
    role="log"
    {...props}
  />
);

export type ConversationContentProps = ComponentProps<typeof StickToBottom.Content>;

export const ConversationContent = ({ className, ...props }: ConversationContentProps) => (
  <StickToBottom.Content
    className={cn("flex w-full shrink-0 flex-col px-4", className)}
    {...props}
  />
);

export type ConversationScrollButtonProps = ComponentProps<typeof Button>;

export const ConversationScrollButton = ({
  className,
  ...props
}: ConversationScrollButtonProps) => {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();
  const handleScrollToBottom = useCallback(() => {
    void scrollToBottom("instant");
  }, [scrollToBottom]);

  return (
    !isAtBottom && (
      <Button
        className={cn(
          "absolute bottom-4 left-[50%] translate-x-[-50%] rounded-full bg-card shadow-md",
          className,
        )}
        onClick={handleScrollToBottom}
        size="icon"
        type="button"
        variant="outline"
        aria-label="Scroll to the latest message"
        {...props}
      >
        <ArrowDownIcon className="size-4" />
      </Button>
    )
  );
};
