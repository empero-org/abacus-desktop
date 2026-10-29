// "Report a bug": a short form beside Settings that sends what happened where
// the terminal's /feedback sends it, through the open abacus.

import { useState } from "react";
import { BugIcon } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Checkbox } from "@/components/ui/checkbox.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import { Textarea } from "@/components/ui/textarea.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.js";
import { useAbacus } from "../context.js";
import type { Report } from "../state.js";
import { Field } from "./Form.js";

const CATEGORIES: { value: Report["category"]; label: string }[] = [
  { value: "bug", label: "Bug" },
  { value: "feature", label: "Feature request" },
  { value: "performance", label: "Performance" },
  { value: "general", label: "Something else" },
];

export function ReportBug() {
  const sendReport = useAbacus((state) => state.sendReport);
  const notify = useAbacus((state) => state.notify);
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<Report["category"]>("bug");
  const [message, setMessage] = useState("");
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setSending(true);
    setError(null);
    const failed = await sendReport({ category, message: message.trim(), includeDiagnostics });
    setSending(false);
    if (failed) {
      setError(failed);
      return;
    }
    setOpen(false);
    setMessage("");
    notify("Thanks — your report was sent.");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <button
              type="button"
              className="rounded-lg p-2 text-foreground-subtle hover:bg-hover hover:text-foreground"
              aria-label="Report a bug"
            >
              <BugIcon className="size-4" />
            </button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">Report a bug</TooltipContent>
      </Tooltip>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Report a bug</DialogTitle>
          <DialogDescription>
            Say what happened and what you expected. It goes to the abacus team with the versions of
            abacus, your OS, and this project's name.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Field label="About">
            <Select
              value={category}
              onValueChange={(value) => setCategory(value as Report["category"])}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((entry) => (
                  <SelectItem key={entry.value} value={entry.value}>
                    {entry.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="What happened">
            <Textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={6}
              placeholder="The plan bar covered the composer after I…"
              autoFocus
            />
          </Field>
          <label className="flex items-center gap-2 text-ui-sm text-foreground-subtle">
            <Checkbox
              checked={includeDiagnostics}
              onCheckedChange={(checked) => setIncludeDiagnostics(checked === true)}
            />
            Include diagnostics: the setup and extension warnings abacus has. No code or messages.
          </label>
          {error ? <p className="text-ui-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={() => void send()} disabled={sending || !message.trim()}>
            {sending ? "Sending…" : "Send report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
