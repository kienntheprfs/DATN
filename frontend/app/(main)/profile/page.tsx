"use client";

import { useState } from "react";
import {
  Mail,
  Phone,
  MapPin,
  Lock,
  Bell,
  BarChart3,
  CheckCircle2,
  Shield,
  FileText,
  History,
  Bookmark,
  Camera,
  Building2,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ProfilePage() {
  const [notifications, setNotifications] = useState({
    email: true,
    system: true,
  });

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-[1400px] mx-auto w-full space-y-6">
        {/* Profile Header */}
        <Card className="border-primary/20 bg-gradient-to-r from-primary to-primary/90 text-primary-foreground overflow-hidden">
          <CardContent className="p-8">
            <div className="flex flex-col md:flex-row gap-6 items-start">
              <div className="relative">
                <div className="w-28 h-28 rounded-2xl bg-primary-foreground/20 backdrop-blur-sm flex items-center justify-center text-4xl font-bold font-mono border-4 border-primary-foreground/30 shadow-2xl">
                  LH
                </div>
                <Button size="icon" variant="secondary" className="absolute -bottom-2 -right-2 rounded-xl shadow-lg">
                  <Camera className="h-5 w-5" />
                </Button>
              </div>
              <div className="flex-1 pt-2">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="space-y-2">
                    <h1 className="text-3xl font-bold tracking-tight">Lê Văn Huy</h1>
                    <div className="flex flex-wrap items-center gap-3">
                      <Badge variant="secondary" className="bg-primary-foreground/20 text-primary-foreground border-primary-foreground/30">
                        Giảng viên
                      </Badge>
                      <span className="text-primary-foreground/80 text-sm">Khoa KH&KT Máy Tính</span>
                    </div>
                    <Badge variant="secondary" className="text-sm font-mono bg-primary-foreground/10 border-primary-foreground/20 text-white">
                      Cán bộ mã số: 123456
                    </Badge>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <Button variant="secondary" className="bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground border-primary-foreground/30">
                      <Lock className="h-4 w-4 mr-2" />
                      Đổi mật khẩu
                    </Button>
                    <Button className="bg-primary-foreground text-primary hover:bg-primary-foreground/90 shadow-lg">
                      Lưu thay đổi
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main Content */}
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          {/* Tabs Section - chiếm 3 phần */}
          <div className="xl:col-span-3">
            <Tabs defaultValue="personal" className="w-full">
              <TabsList className="mb-6">
                <TabsTrigger value="personal">Thông tin cá nhân</TabsTrigger>
                <TabsTrigger value="history">Lịch sử hoạt động</TabsTrigger>
                <TabsTrigger value="saved">Tài liệu đã lưu</TabsTrigger>
              </TabsList>

              <TabsContent value="personal" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <Mail className="h-5 w-5 text-primary" />
                      </div>
                      Thông tin liên hệ
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="email">Email Đại học (VNU)</Label>
                        <InputGroup>
                          <InputGroupAddon align="inline-start">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                          </InputGroupAddon>
                          <InputGroupInput id="email" disabled value="huy.le@hcmut.edu.vn" />
                        </InputGroup>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Lock className="h-3 w-3" />
                          Email chính thức không thể thay đổi
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phone">Số điện thoại</Label>
                        <InputGroup>
                          <InputGroupAddon align="inline-start">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                          </InputGroupAddon>
                          <InputGroupInput id="phone" defaultValue="0912 345 678" />
                        </InputGroup>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="office">Văn phòng làm việc</Label>
                        <InputGroup>
                          <InputGroupAddon align="inline-start">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                          </InputGroupAddon>
                          <InputGroupInput id="office" defaultValue="P.304 - Nhà A5" />
                        </InputGroup>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="department">Đơn vị quản lý</Label>
                        <Select defaultValue="computer-science">
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Chọn đơn vị" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="computer-science">Khoa KH&KT Máy Tính</SelectItem>
                            <SelectItem value="electrical">Khoa Điện - Điện Tử</SelectItem>
                            <SelectItem value="mechanical">Khoa Cơ Khí</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <Bell className="h-5 w-5 text-primary" />
                      </div>
                      Cài đặt thông báo
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50 border">
                      <Checkbox
                        id="notif-email"
                        checked={notifications.email}
                        onCheckedChange={(checked) =>
                          setNotifications((prev) => ({
                            ...prev,
                            email: checked === true,
                          }))
                        }
                      />
                      <div className="flex-1 space-y-1">
                        <Label htmlFor="notif-email" className="font-medium cursor-pointer">
                          Thông báo qua Email
                          <Badge variant="secondary" className="ml-2 text-xs">Khuyến nghị</Badge>
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Nhận email khi có văn bản quy chế mới liên quan đến Khoa
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50 border">
                      <Checkbox
                        id="notif-system"
                        checked={notifications.system}
                        onCheckedChange={(checked) =>
                          setNotifications((prev) => ({
                            ...prev,
                            system: checked === true,
                          }))
                        }
                      />
                      <div className="flex-1 space-y-1">
                        <Label htmlFor="notif-system" className="font-medium cursor-pointer">
                          Cập nhật hệ thống
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Nhận thông báo về bảo trì hệ thống và tính năng mới
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <Lock className="h-5 w-5 text-primary" />
                      </div>
                      Bảo mật
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="current-pwd">Mật khẩu hiện tại</Label>
                        <InputGroup>
                          <InputGroupAddon align="inline-start">
                            <Lock className="h-4 w-4 text-muted-foreground" />
                          </InputGroupAddon>
                          <InputGroupInput id="current-pwd" type="password" placeholder="Nhập mật khẩu hiện tại" />
                        </InputGroup>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="new-pwd">Mật khẩu mới</Label>
                        <InputGroup>
                          <InputGroupAddon align="inline-start">
                            <Lock className="h-4 w-4 text-muted-foreground" />
                          </InputGroupAddon>
                          <InputGroupInput id="new-pwd" type="password" placeholder="Nhập mật khẩu mới" />
                        </InputGroup>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                      <Info className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>Mật khẩu phải có ít nhất 8 ký tự, bao gồm chữ hoa, chữ thường và số</span>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="history">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <History className="h-5 w-5 text-primary" />
                      </div>
                      Lịch sử hoạt động gần đây
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y">
                      {[
                        { icon: FileText, action: "Tra cứu văn bản", detail: "Quy chế đào tạo tín chỉ 2024", time: "2 giờ trước", color: "bg-blue-100 text-blue-600" },
                        { icon: Bookmark, action: "Lưu tài liệu", detail: "Quy định về thi cử", time: "1 ngày trước", color: "bg-emerald-100 text-emerald-600" },
                        { icon: History, action: "Đăng nhập", detail: "Từ thiết bị mới - Chrome on Windows", time: "3 ngày trước", color: "bg-purple-100 text-purple-600" },
                      ].map((item, index) => (
                        <div key={index} className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors cursor-pointer">
                          <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-xl ${item.color} flex items-center justify-center`}>
                              <item.icon className="h-6 w-6" />
                            </div>
                            <div>
                              <p className="font-medium">{item.action}</p>
                              <p className="text-sm text-muted-foreground">{item.detail}</p>
                            </div>
                          </div>
                          <Badge variant="secondary">{item.time}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="saved">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <Bookmark className="h-5 w-5 text-primary" />
                        </div>
                        Tài liệu đã lưu
                      </CardTitle>
                      <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">23 tài liệu</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y">
                      {[
                        { title: "Quy chế đào tạo tín chỉ", category: "Đào tạo", date: "15/01/2024", color: "bg-blue-100 text-blue-600" },
                        { title: "Quy định về thi cử", category: "Đào tạo", date: "10/01/2024", color: "bg-emerald-100 text-emerald-600" },
                        { title: "Quy trình xin nghỉ phép", category: "Công tác sinh viên", date: "05/01/2024", color: "bg-purple-100 text-purple-600" },
                      ].map((doc, index) => (
                        <div key={index} className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors cursor-pointer">
                          <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-xl ${doc.color} flex items-center justify-center`}>
                              <FileText className="h-6 w-6" />
                            </div>
                            <div>
                              <p className="font-medium">{doc.title}</p>
                              <Badge variant="outline" className="mt-1">{doc.category}</Badge>
                            </div>
                          </div>
                          <Badge variant="secondary">{doc.date}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Right Sidebar - chiếm 1 phần */}
          <div className="xl:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <BarChart3 className="h-5 w-5 text-primary" />
                  </div>
                  Thống kê tài khoản
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Phiên làm việc tháng này</span>
                    <span className="text-lg font-bold text-primary font-mono">42</span>
                  </div>
                  <Progress value={70} className="h-2" />
                  <p className="text-xs text-muted-foreground text-right">70% so với tháng trước</p>
                </div>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Câu hỏi đã tạo</span>
                    <span className="text-lg font-bold font-mono">156</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Tài liệu đã lưu</span>
                    <span className="text-lg font-bold font-mono">23</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-emerald-50/50 border-emerald-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-emerald-900">
                  <div className="p-2 bg-emerald-100 rounded-lg">
                    <Shield className="h-5 w-5 text-emerald-600" />
                  </div>
                  Quyền truy cập
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-emerald-800">Tài khoản của bạn có quyền truy cập vào các kho dữ liệu sau:</p>
                <ul className="space-y-2">
                  {[
                    { text: "Kho văn bản Quy chế Đào tạo", granted: true },
                    { text: "Kho văn bản Công tác Sinh viên", granted: true },
                    { text: "Kho văn bản Sau đại học", granted: true },
                    { text: "Kho văn bản Tài chính (Hạn chế)", granted: false },
                  ].map((item, index) => (
                    <li key={index} className="flex items-center gap-2 text-sm">
                      {item.granted ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          <span className="text-emerald-900">{item.text}</span>
                        </>
                      ) : (
                        <>
                          <Lock className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">{item.text}</span>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
