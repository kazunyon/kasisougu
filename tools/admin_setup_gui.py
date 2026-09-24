"""L01 desktop setup screen for the administrator support tool."""
import queue
import shutil
import subprocess
import threading
import tkinter as tk
from tkinter import messagebox, ttk

from setup_admin_management import ROOT, prepare_secrets, validate


class SetupWindow:
    def __init__(self) -> None:
        self.root = tk.Tk()
        self.root.title("装具びより｜管理者支援ツール 初回設定")
        self.root.geometry("850x690")
        self.root.minsize(700, 600)
        self.root.configure(bg="#f4f8f5")
        self.queue: queue.Queue[tuple[str, object]] = queue.Queue()
        self.busy = False
        self.checked_ref = ""
        self.checked_settings = None
        self.secret_path = None
        self.bootstrap_token = ""
        self.project_ref = tk.StringVar()
        self.app_origin = tk.StringVar(value="https://kazunyon.github.io")
        self.redirect_url = tk.StringVar(value="https://kazunyon.github.io/kasisougu/invitation.html")
        self.code_visible = False
        self._build()
        self.root.after(100, self._drain)

    def _build(self) -> None:
        style = ttk.Style(self.root)
        style.theme_use("clam")
        style.configure("TFrame", background="#f4f8f5")
        style.configure("TLabel", background="#f4f8f5", foreground="#18342a", font=("Yu Gothic", 10))
        style.configure("Title.TLabel", font=("Yu Gothic", 19, "bold"), foreground="#1e7755")
        style.configure("TButton", font=("Yu Gothic", 10), padding=8)
        frame = ttk.Frame(self.root, padding=24)
        frame.pack(fill="both", expand=True)
        ttk.Label(frame, text="初回設定  L01", style="Title.TLabel").pack(anchor="w")
        ttk.Label(frame, text="接続先を確認し、データベースと管理機能を順に配置します。", wraplength=780).pack(anchor="w", pady=(4, 18))
        for label, variable in (
            ("Supabase project-ref", self.project_ref),
            ("アプリのオリジン", self.app_origin),
            ("招待メールの戻り先", self.redirect_url),
        ):
            ttk.Label(frame, text=label).pack(anchor="w", pady=(5, 0))
            ttk.Entry(frame, textvariable=variable, width=95).pack(fill="x", pady=(3, 7))
        button_row = ttk.Frame(frame)
        button_row.pack(fill="x", pady=(10, 8))
        self.check_button = ttk.Button(button_row, text="1. 接続先と変更内容を確認", command=self._check)
        self.check_button.pack(side="left", padx=(0, 10))
        self.apply_button = ttk.Button(button_row, text="2. 設定を反映", command=self._apply, state="disabled")
        self.apply_button.pack(side="left")
        ttk.Label(frame, text="実行内容", font=("Yu Gothic", 11, "bold")).pack(anchor="w", pady=(14, 4))
        self.log = tk.Text(frame, height=13, wrap="word", state="disabled", bg="#ffffff", fg="#18342a", font=("Consolas", 10))
        self.log.pack(fill="both", expand=True)
        ttk.Label(frame, text="初回管理者の確認コード（配置完了後に表示）").pack(anchor="w", pady=(16, 3))
        code_row = ttk.Frame(frame)
        code_row.pack(fill="x")
        self.code = ttk.Entry(code_row, show="●", state="readonly")
        self.code.pack(side="left", fill="x", expand=True)
        self.show_button = ttk.Button(code_row, text="表示", command=self._toggle_code, state="disabled")
        self.show_button.pack(side="left", padx=(8, 0))
        ttk.Label(frame, text="通常登録の停止、SMTP、Auth Redirect URL は Supabase Dashboard で設定してください。", wraplength=780).pack(anchor="w", pady=(15, 0))

    def _line(self, text: str) -> None:
        self.log.configure(state="normal")
        self.log.insert("end", text.rstrip() + "\n")
        self.log.see("end")
        self.log.configure(state="disabled")

    def _command(self, *args: str) -> None:
        command = list(args)
        if command[0] == "npx":
            command[0] = shutil.which("npx") or "npx"
        self.queue.put(("line", "実行: " + " ".join(args)))
        process = subprocess.Popen(command, cwd=ROOT, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                   stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace")
        assert process.stdout is not None
        for line in process.stdout:
            self.queue.put(("line", line.rstrip()))
        if process.wait() != 0:
            raise RuntimeError(f"コマンドを完了できませんでした: {' '.join(args)}")

    def _start(self, work, done) -> None:
        if self.busy:
            return
        self.busy = True
        self.check_button.configure(state="disabled")
        self.apply_button.configure(state="disabled")
        def runner() -> None:
            try:
                result = work()
                self.queue.put(("done", (done, result)))
            except Exception as error:
                self.queue.put(("error", str(error)))
        threading.Thread(target=runner, daemon=True).start()

    def _check(self) -> None:
        ref = self.project_ref.get().strip()
        origin = self.app_origin.get().strip()
        redirect = self.redirect_url.get().strip()
        try:
            validate(ref, origin, redirect)
        except ValueError as error:
            messagebox.showerror("入力を確認", str(error), parent=self.root)
            return
        if not messagebox.askyesno("接続先の確認", f"project-ref は {ref} です。\nこのプロジェクトへ接続しますか？", parent=self.root):
            return
        def work():
            path, values = prepare_secrets(ref, origin, redirect)
            self.queue.put(("line", f"秘密値ファイルを準備: {path.name}（内容は表示しません）"))
            self._command("npx", "supabase", "link", "--project-ref", ref)
            self._command("npx", "supabase", "db", "push", "--dry-run")
            return path, values["ADMIN_BOOTSTRAP_TOKEN"], (ref, origin, redirect)
        self._start(work, self._checked)

    def _checked(self, result) -> None:
        self.secret_path, self.bootstrap_token, self.checked_settings = result
        self.checked_ref = self.checked_settings[0]
        self._line("変更内容を確認しました。上の一覧に管理機能以外の migration があれば、その内容も確認してください。")
        self.apply_button.configure(state="normal")

    def _apply(self) -> None:
        ref = self.checked_ref
        current = (self.project_ref.get().strip(), self.app_origin.get().strip(), self.redirect_url.get().strip())
        if not ref or current != self.checked_settings:
            messagebox.showerror("接続先を確認", "接続先が変わりました。もう一度、接続先を確認してください。", parent=self.root)
            return
        if not messagebox.askyesno("設定の反映", f"{ref} へ migration・秘密値・Edge Function を反映します。\n実行しますか？", parent=self.root):
            return
        path = self.secret_path
        def work():
            self._command("npx", "supabase", "link", "--project-ref", ref)
            self._command("npx", "supabase", "db", "push")
            self._command("npx", "supabase", "secrets", "set", "--env-file", str(path))
            self._command("npx", "supabase", "functions", "deploy", "request-invitation")
            self._command("npx", "supabase", "functions", "deploy", "admin-management")
            return None
        self._start(work, self._applied)

    def _applied(self, _) -> None:
        self._line("配置が完了しました。管理画面を公開し、確認済みアカウントでログインしてください。")
        self.code.configure(state="normal")
        self.code.insert(0, self.bootstrap_token)
        self.code.configure(state="readonly")
        self.show_button.configure(state="normal")
        messagebox.showinfo("配置完了", "初回管理者の確認コードを画面下部から確認できます。秘密値ファイルも安全な場所に保管してください。", parent=self.root)

    def _toggle_code(self) -> None:
        self.code_visible = not self.code_visible
        self.code.configure(show="" if self.code_visible else "●")
        self.show_button.configure(text="隠す" if self.code_visible else "表示")

    def _drain(self) -> None:
        try:
            while True:
                kind, value = self.queue.get_nowait()
                if kind == "line":
                    self._line(str(value))
                elif kind == "done":
                    self.busy = False
                    self.check_button.configure(state="normal")
                    callback, result = value
                    callback(result)
                elif kind == "error":
                    self.busy = False
                    self.check_button.configure(state="normal")
                    self._line("エラー: " + str(value))
                    messagebox.showerror("設定を完了できませんでした", str(value), parent=self.root)
        except queue.Empty:
            pass
        self.root.after(100, self._drain)

    def run(self) -> None:
        self.root.mainloop()


if __name__ == "__main__":
    SetupWindow().run()
