import Link from "@/components/site-link";
import { AlertCircle } from "lucide-react";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

type ButtonBaseProps = {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  icon?: ReactNode;
  iconPosition?: "left" | "right";
  disabled?: boolean;
  className?: string;
};

type ButtonLinkProps = ButtonBaseProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof ButtonBaseProps | "href"> & {
    href: string;
  };

type ButtonNativeProps = ButtonBaseProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonBaseProps> & {
    href?: undefined;
  };

export type ButtonProps = ButtonLinkProps | ButtonNativeProps;

export function Button(props: ButtonProps) {
  const {
    children,
    variant = "primary",
    size = "md",
    icon,
    iconPosition = "right",
    className,
    disabled,
    ...rest
  } = props;
  const classes = cx("button", `button--${variant}`, `button--${size}`, className);
  const content = (
    <>
      {icon && iconPosition === "left" && <span className="button__icon" aria-hidden="true">{icon}</span>}
      <span>{children}</span>
      {icon && iconPosition === "right" && <span className="button__icon" aria-hidden="true">{icon}</span>}
    </>
  );

  if (rest.href !== undefined) {
    if (disabled) {
      return <span className={classes} role="link" aria-disabled="true">{content}</span>;
    }
    return <Link {...rest} className={classes}>{content}</Link>;
  }

  return <button type="button" {...rest} disabled={disabled} className={classes}>{content}</button>;
}

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: "default" | "accent" | "outline";
  dot?: boolean;
};

export function Badge({ children, className, tone = "default", dot, ...props }: BadgeProps) {
  return (
    <span {...props} className={cx("badge", `badge--${tone}`, className)}>
      {dot && <span className="badge__dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

export type CardProps = HTMLAttributes<HTMLElement> & {
  as?: "article" | "div" | "section";
};

export function Card({ as: Component = "article", className, children, ...props }: CardProps) {
  return <Component {...props} className={cx("card", className)}>{children}</Component>;
}

export type SectionHeadingProps = {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
  align?: "left" | "center";
  id?: string;
  className?: string;
};

export function SectionHeading({ eyebrow, title, description, aside, align = "left", id, className }: SectionHeadingProps) {
  return (
    <div className={cx("section-heading", align === "center" && "section-heading--center", className)}>
      <div className="section-heading__main">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2 className="section-title" id={id}>{title}</h2>
        {description && <p className="section-heading__description">{description}</p>}
      </div>
      {aside && <div className="section-heading__aside">{aside}</div>}
    </div>
  );
}

type FieldProps = {
  id: string;
  label: string;
  helper?: string;
  error?: string;
  wrapperClassName?: string;
};

function descriptionIds(id: string, helper: string | undefined, error: string | undefined, describedBy: string | undefined) {
  return [describedBy, helper && `${id}-help`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
}

function FieldLabel({ id, label, required }: Pick<FieldProps, "id" | "label"> & { required?: boolean }) {
  return <label className="field__label" htmlFor={id}>{label}{required && <span className="field__required" aria-hidden="true">*</span>}</label>;
}

function FieldFeedback({ id, helper, error }: Pick<FieldProps, "id" | "helper" | "error">) {
  return (
    <>
      {helper && <p className="field__helper" id={`${id}-help`}>{helper}</p>}
      {error && <p className="field__error" id={`${id}-error`}><AlertCircle aria-hidden="true" />{error}</p>}
    </>
  );
}

export type InputProps = FieldProps & InputHTMLAttributes<HTMLInputElement>;

export function Input({ id, label, helper, error, wrapperClassName, className, required, "aria-describedby": describedBy, ...props }: InputProps) {
  return (
    <div className={cx("field", wrapperClassName)}>
      <FieldLabel id={id} label={label} required={required} />
      <input {...props} id={id} required={required} className={cx("field__input", className)} aria-invalid={error ? true : props["aria-invalid"]} aria-describedby={descriptionIds(id, helper, error, describedBy)} />
      <FieldFeedback id={id} helper={helper} error={error} />
    </div>
  );
}

export type SelectProps = FieldProps & SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ id, label, helper, error, wrapperClassName, className, required, children, "aria-describedby": describedBy, ...props }: SelectProps) {
  return (
    <div className={cx("field", wrapperClassName)}>
      <FieldLabel id={id} label={label} required={required} />
      <select {...props} id={id} required={required} className={cx("field__input", "field__select", className)} aria-invalid={error ? true : props["aria-invalid"]} aria-describedby={descriptionIds(id, helper, error, describedBy)}>{children}</select>
      <FieldFeedback id={id} helper={helper} error={error} />
    </div>
  );
}

export type TextareaProps = FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ id, label, helper, error, wrapperClassName, className, required, "aria-describedby": describedBy, ...props }: TextareaProps) {
  return (
    <div className={cx("field", wrapperClassName)}>
      <FieldLabel id={id} label={label} required={required} />
      <textarea rows={5} {...props} id={id} required={required} className={cx("field__input", "field__textarea", className)} aria-invalid={error ? true : props["aria-invalid"]} aria-describedby={descriptionIds(id, helper, error, describedBy)} />
      <FieldFeedback id={id} helper={helper} error={error} />
    </div>
  );
}
