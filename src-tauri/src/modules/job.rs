// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

//! Windows Job Object with KILL_ON_JOB_CLOSE for spawned children.
//! Dropping the handle kills the whole tree — only reliable orphan guard
//! on Windows.
//!
//! Two callers need it, for the same reason from different directions. A
//! ConPTY child is a shell, so anything it started is a grandchild. And a
//! program resolved to a `.cmd` shim is not run directly at all: Rust's std
//! detects the extension and spawns `cmd.exe /d /c "<shim> ..."`, so the
//! handle the caller holds is the wrapper and the real process — an
//! npm-installed language server or debug adapter — is a grandchild again.
//! `Child::kill` is `TerminateProcess`, which does not walk the tree.

// Panic-lint gate: no `.unwrap()`/`.expect()` in production code here.
// Tests may still panic (allow-*-in-tests in clippy.toml). CI's
// `clippy -- -D warnings` turns a new one into a build failure.
#![warn(clippy::unwrap_used, clippy::expect_used)]
#![cfg(windows)]

use std::io;
use std::mem::{size_of, zeroed};

use windows_sys::Win32::Foundation::{CloseHandle, FALSE, HANDLE, INVALID_HANDLE_VALUE};
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
    SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
};
use windows_sys::Win32::System::Threading::{OpenProcess, PROCESS_SET_QUOTA, PROCESS_TERMINATE};

pub struct ProcessJob {
    handle: HANDLE,
}

unsafe impl Send for ProcessJob {}
unsafe impl Sync for ProcessJob {}

impl ProcessJob {
    pub fn create_for(pid: u32) -> io::Result<Self> {
        unsafe {
            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if job.is_null() || job == INVALID_HANDLE_VALUE {
                return Err(io::Error::last_os_error());
            }

            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let ok = SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                &info as *const _ as *const _,
                size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            );
            if ok == 0 {
                let e = io::Error::last_os_error();
                CloseHandle(job);
                return Err(e);
            }

            let process = OpenProcess(PROCESS_TERMINATE | PROCESS_SET_QUOTA, FALSE, pid);
            if process.is_null() {
                let e = io::Error::last_os_error();
                CloseHandle(job);
                return Err(e);
            }

            let assign = AssignProcessToJobObject(job, process);
            CloseHandle(process);
            if assign == 0 {
                let e = io::Error::last_os_error();
                CloseHandle(job);
                return Err(e);
            }

            Ok(Self { handle: job })
        }
    }
}

impl Drop for ProcessJob {
    fn drop(&mut self) {
        if !self.handle.is_null() && self.handle != INVALID_HANDLE_VALUE {
            unsafe { CloseHandle(self.handle) };
        }
    }
}
